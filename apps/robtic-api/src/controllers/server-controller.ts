import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { ok } from "../lib/respond";
import { optionalQueryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { publishBridgeEvent } from "@core/minecraft";
import { ServerSettingsService } from "../services/server-settings-service";
import { ServerService } from "../services/server-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

/** The telemetry body shared by start, stop, status and heartbeat. */
const reportBody = {
    guildId: schema.snowflake(),
    status: v.oneOf(["ONLINE", "OFFLINE", "RESTARTING", "CRASHED"] as const),
    onlinePlayers: v.number({ min: 0, integer: true }),
    maxPlayers: v.number({ min: 0, integer: true }),
    minecraftVersion: v.string({ min: 1, max: 32 }),
    software: v.optional(v.string({ max: 64 })),
    javaVersion: v.optional(v.string({ max: 32 })),
    tps: v.optional(v.number({ min: 0, max: 100 })),
    memoryUsedMb: v.optional(v.number({ min: 0 })),
    memoryMaxMb: v.optional(v.number({ min: 0 })),
    cpuPercent: v.optional(v.number({ min: 0, max: 100 })),
    uptimeMs: v.optional(v.number({ min: 0 })),
    world: v.optional(v.string({ max: 64 })),
    ...schema.serverIdentity(),
};

const presenceBody = {
    guildId: schema.snowflake(),
    uuid: schema.uuid(),
    username: schema.username(),
    requestId: schema.requestId(),
    sessionMs: v.optional(v.number({ min: 0 })),
    ...schema.serverIdentity(),
};

export const serverRoutes: Route[] = [
    {
        method: "POST",
        path: API_ROUTES.server.start,
        scope: API_SCOPES.server,
        summary: "Report that a Minecraft server has started",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, reportBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            await ServerService.reportStart({ ...body, guildId, serverId, status: "ONLINE" });

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: "server_started",
                fields: { Version: body.minecraftVersion, Software: body.software ?? "unknown" },
                occurredAt: new Date().toISOString(),
                requestId: context.requestId ?? "",
            });

            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.stop,
        scope: API_SCOPES.server,
        summary: "Report a clean shutdown",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, reportBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            await ServerService.report({ ...body, guildId, serverId, status: "OFFLINE", onlinePlayers: 0 });

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: "server_stopped",
                occurredAt: new Date().toISOString(),
                requestId: context.requestId ?? "",
            });

            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.status,
        scope: API_SCOPES.server,
        summary: "Report a status transition",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, reportBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            await ServerService.report({ ...body, guildId, serverId });
            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.heartbeat,
        scope: API_SCOPES.server,
        summary: "Periodic liveness and telemetry report",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, reportBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            await ServerService.report({ ...body, guildId, serverId });
            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.settings,
        scope: API_SCOPES.server,
        summary: "Store the configuration a game server pushed from its own config files",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                statusChannelId: v.string({ max: 32 }),
                chatChannelId: v.string({ max: 32 }),
                staffChatChannelId: v.string({ max: 32 }),
                defaultLogChannelId: v.string({ max: 32 }),
                chatBridgeEnabled: v.boolean(),
                roleSyncEnabled: v.boolean(),
                staffSystemEnabled: v.boolean(),
                jailRoleId: v.string({ max: 32 }),
                logTargets: v.arrayOf(
                    v.object({ action: v.string({ max: 40 }), channelId: v.string({ max: 32 }) }),
                    { max: 40 },
                ),
                roleMappings: v.arrayOf(
                    v.object({ roleId: schema.snowflake(), group: v.string({ max: 48 }) }),
                    { max: 100 },
                ),
                prices: v.arrayOf(
                    v.object({
                        itemKey: schema.itemKey(),
                        price: v.number({ min: 1, max: 1_000_000, integer: true }),
                        enabled: v.boolean(),
                    }),
                    { max: 200 },
                ),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            requireServerId(context, body.serverId);

            const applied = await ServerSettingsService.apply(guildId, body);
            return ok({ acknowledged: true as const, ...applied });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.playerJoin,
        scope: API_SCOPES.server,
        summary: "Register a join and return the player's link, punishment and history state",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, presenceBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Not idempotency-wrapped: this is a read-shaped call whose response the join handler
            // needs every time, including on a reconnect that reuses a request id.
            const state = await ServerService.playerJoin({
                guildId,
                serverId,
                uuid: body.uuid,
                username: body.username,
            });

            // Announced to Discord, which is also what re-projects the player's roles.
            //
            // The bot's drain has handled `player_join` since this system was written, and nothing
            // has ever published one — so the join announcement never fired, and neither did the
            // role sync hanging off it. That sync is the only thing that repairs a member whose
            // roles were never projected: linking projects them once, and if the guild's role
            // mappings were configured *after* that, the projection is empty for good. The player
            // then holds their Discord staff role, has it written in roles.yml, and is still told
            // "no permission" by /admin, because the API is serving an empty role list.
            //
            // Published on every join so that state repairs itself the next time they log in.
            await publishBridgeEvent({
                guildId,
                direction: "to_discord",
                type: "player_join",
                serverKey: null,
                payload: {
                    minecraftUuid: body.uuid,
                    username: body.username,
                    serverKey: serverId,
                    serverName: context.serverName ?? serverId,
                },
            });

            return ok(state);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.server.playerLeave,
        scope: API_SCOPES.server,
        summary: "Register a disconnect",
        tag: "Server",
        handler: async context => {
            const body = validateBody(context.body, presenceBody);
            const guildId = requireGuildId(context, body.guildId);

            const { duplicate } = await withIdempotency(body.requestId, guildId, "server.playerLeave", async () => {
                await ServerService.playerLeave({ guildId, uuid: body.uuid });

                // The other half of the pair above: the bot has always known how to announce a
                // quit and has never been sent one.
                await publishBridgeEvent({
                    guildId,
                    direction: "to_discord",
                    type: "player_quit",
                    serverKey: null,
                    payload: {
                        minecraftUuid: body.uuid,
                        username: body.username,
                        serverKey: context.serverId ?? "",
                        serverName: context.serverName ?? "",
                    },
                });

                return { acknowledged: true };
            });

            return ok({ acknowledged: true as const, requestId: body.requestId, duplicate });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.server.info,
        scope: API_SCOPES.server,
        summary: "Public server information, backing the bot's !ip, !version and !status commands",
        tag: "Server",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await ServerService.info(guildId, optionalQueryParam(context, "serverId")));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.server.config,
        scope: API_SCOPES.server,
        summary: "Startup bundle: prices, staff ranks, lobbies and logging targets in one call",
        tag: "Server",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context);
            return ok(await ServerService.configBundle(guildId, serverId));
        },
    },
];
