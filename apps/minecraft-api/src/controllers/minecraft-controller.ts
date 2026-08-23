import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { ok } from "../lib/respond";
import { optionalQueryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { LinkService } from "../services/link-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

export const minecraftRoutes: Route[] = [
    {
        method: "POST",
        path: API_ROUTES.minecraft.link,
        scope: API_SCOPES.link,
        summary: "Issue a one-time account-linking code for a player",
        tag: "Linking",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                serverId: schema.serverId(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const issued = await LinkService.issueCode({
                guildId,
                uuid: body.uuid,
                username: body.username,
                serverId,
            });

            return ok({
                code: issued.code,
                expiresAt: issued.expiresAt.toISOString(),
                minutesValid: issued.minutesValid,
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.minecraft.verify,
        scope: API_SCOPES.link,
        summary: "Redeem a linking code and create the Discord ↔ Minecraft link",
        tag: "Linking",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                code: v.string({ min: 4, max: 16 }),
                discordId: schema.snowflake(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const linked = await LinkService.verify({ guildId, code: body.code, discordId: body.discordId });

            await DiscordLogService.publish({
                guildId,
                serverId: context.serverId ?? "discord",
                serverName: context.serverName ?? "Discord",
                action: "player_linked",
                targetUuid: linked.uuid,
                targetUsername: linked.username,
                targetDiscordId: linked.discordId,
                occurredAt: new Date().toISOString(),
                requestId: context.requestId ?? "",
            });

            return ok({ linked: true, ...linked });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.minecraft.player,
        scope: API_SCOPES.link,
        summary: "Resolve a player's link, Discord roles, staff rank and punishment state",
        tag: "Linking",
        handler: async context => {
            const guildId = requireGuildId(context);

            return ok(
                await LinkService.player(guildId, {
                    uuid: optionalQueryParam(context, "uuid"),
                    username: optionalQueryParam(context, "username"),
                    discordId: optionalQueryParam(context, "discordId"),
                }),
            );
        },
    },
    {
        method: "POST",
        path: API_ROUTES.minecraft.unlink,
        scope: API_SCOPES.link,
        summary: "Remove a Discord ↔ Minecraft link",
        tag: "Linking",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: v.optional(schema.uuid()),
                discordId: v.optional(schema.snowflake()),
                reason: schema.reason(),
            });

            const guildId = requireGuildId(context, body.guildId);
            await LinkService.unlink(guildId, { uuid: body.uuid, discordId: body.discordId });

            await DiscordLogService.publish({
                guildId,
                serverId: context.serverId ?? "discord",
                serverName: context.serverName ?? "Discord",
                action: "player_unlinked",
                targetUuid: body.uuid,
                targetDiscordId: body.discordId,
                reason: body.reason,
                occurredAt: new Date().toISOString(),
                requestId: context.requestId ?? "",
            });

            return ok({ acknowledged: true as const });
        },
    },
];
