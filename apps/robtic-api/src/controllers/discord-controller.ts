import { API_ROUTES, API_SCOPES, normaliseUuid, schema, v, validateBody } from "@sdk";
import { MINECRAFT_BRIDGE } from "@constants";
import {
    MinecraftBridgeRepository,
    MinecraftLinkRepository,
    MinecraftRoleStateRepository,
} from "@database/repositories";
import { publishBridgeEvent } from "@core/minecraft";
import { ok } from "../lib/respond";
import { intQueryParam, queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

export const discordRoutes: Route[] = [
    {
        method: "GET",
        path: API_ROUTES.discord.roles,
        scope: API_SCOPES.discord,
        summary: "Read a linked player's projected Discord roles and LuckPerms groups",
        tag: "Discord",
        handler: async context => {
            const guildId = requireGuildId(context);
            const uuid = normaliseUuid(queryParam(context, "uuid"));

            const state = await MinecraftRoleStateRepository.getByUuid(guildId, uuid);
            const link = state ? null : await MinecraftLinkRepository.getByUuid(guildId, uuid);

            return ok({
                guildId,
                discordId: state?.discordId ?? link?.discordId ?? "",
                uuid,
                roleIds: state?.roleIds ?? [],
                groups: state?.groups ?? [],
                syncedAt: state?.syncedAt?.toISOString() ?? new Date(0).toISOString(),
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.discord.chat,
        scope: API_SCOPES.discord,
        summary: "Relay an in-game chat line to the public or staff Discord channel",
        tag: "Discord",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                channel: v.oneOf(["public", "staff"] as const),
                uuid: schema.uuid(),
                username: schema.username(),
                message: v.string({ min: 1, max: MINECRAFT_BRIDGE.maxChatLength }),
                rankName: v.optional(v.string({ max: 32 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { duplicate } = await withIdempotency(body.requestId, guildId, "discord.chat", async () => {
                // Queued rather than posted inline: the bot owns the Discord connection and the
                // channel routing, and the existing drain already handles rate limits and retries.
                await publishBridgeEvent({
                    guildId,
                    // This line came *from* the game, so it belongs in the queue the bot drains.
                    // Without this the bot never sees it and the plugin's own poller claims it
                    // instead, echoing the player's message back into the game.
                    direction: "to_discord",
                    type: body.channel === "staff" ? "staff_chat" : "chat",
                    serverKey: null,
                    payload: {
                        minecraftUuid: body.uuid,
                        username: body.username,
                        message: body.message,
                        rankName: body.rankName,
                        serverKey: serverId,
                        origin: "minecraft",
                    },
                });

                return { acknowledged: true };
            });

            return ok({ acknowledged: true as const, requestId: body.requestId, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.discord.log,
        scope: API_SCOPES.discord,
        summary: "Publish a structured moderation embed to the configured destination",
        tag: "Discord",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                action: schema.staffAction(),
                moderatorUuid: v.optional(schema.uuid()),
                moderatorUsername: v.optional(schema.username()),
                targetUuid: v.optional(schema.uuid()),
                targetUsername: v.optional(schema.username()),
                reason: v.optional(schema.reason()),
                duration: v.optional(v.string({ max: 64 })),
                occurredAt: v.string({ min: 8, max: 40 }),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { duplicate } = await withIdempotency(body.requestId, guildId, "discord.log", async () => {
                await DiscordLogService.publish({ ...body, guildId, serverId });
                return { acknowledged: true };
            });

            return ok({ acknowledged: true as const, requestId: body.requestId, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.discord.status,
        scope: API_SCOPES.discord,
        summary: "Ask the bot to re-render the server status panel",
        tag: "Discord",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            await publishBridgeEvent({
                guildId,
                // The bot renders the panel, so this is a request aimed at Discord.
                direction: "to_discord",
                type: "server_status",
                serverKey: null,
                payload: { serverKey: serverId, displayName: body.serverName },
            });

            return ok({ acknowledged: true as const, requestId: body.requestId });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.discord.pending,
        scope: API_SCOPES.discord,
        summary: "Drain events Discord has queued for this server",
        tag: "Discord",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context);
            const limit = intQueryParam(context, "limit", MINECRAFT_BRIDGE.batchSize, MINECRAFT_BRIDGE.batchSize);

            // Claiming is per-server, so a broadcast reaches every server in the guild exactly once.
            const events = await MinecraftBridgeRepository.claimForServer(guildId, serverId, limit);

            return ok({
                events: events.map(event => ({
                    id: String(event._id),
                    type: event.type,
                    payload: event.payload,
                    createdAt: event.createdAt.toISOString(),
                })),
            });
        },
    },
];
