import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { MINECRAFT_HISTORY_DEFAULT_LIMIT, MINECRAFT_PRICE_LIMITS } from "@constants";
import { getItemPrices, invalidatePriceCache, setItemPrice } from "@core/minecraft";
import { ok } from "../lib/respond";
import { intQueryParam, optionalQueryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { EconomyService } from "../services/economy-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

const MAX_PAGE = 100;

export const economyRoutes: Route[] = [
    {
        method: "GET",
        path: API_ROUTES.economy.coinsPattern,
        scope: API_SCOPES.economy,
        summary: "Read a player's live coin balance",
        tag: "Economy",
        handler: async context => {
            const guildId = requireGuildId(context);
            // Taken from the path rather than the query, so the route reads as the resource it is.
            const uuid = context.url.pathname.split("/").pop() ?? "";
            return ok(await EconomyService.balance(guildId, uuid));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.economy.leaderboard,
        scope: API_SCOPES.economy,
        summary: "Read the coin leaderboard, and optionally one player's position in it",
        tag: "Economy",
        handler: async context => {
            const guildId = requireGuildId(context);
            const limit = intQueryParam(context, "limit", 10, MAX_PAGE);
            return ok(await EconomyService.leaderboard(guildId, limit, optionalQueryParam(context, "uuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.economy.add,
        scope: API_SCOPES.economy,
        summary: "Credit coins to a player",
        tag: "Economy",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: v.optional(schema.uuid()),
                discordId: v.optional(schema.snowflake()),
                amount: v.number({ min: 1, integer: true }),
                reason: schema.reason(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "economy.add", async () =>
                EconomyService.credit(guildId, { uuid: body.uuid, discordId: body.discordId }, body.amount),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.economy.remove,
        scope: API_SCOPES.economy,
        summary: "Debit coins from a player",
        tag: "Economy",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: v.optional(schema.uuid()),
                discordId: v.optional(schema.snowflake()),
                amount: v.number({ min: 1, integer: true }),
                reason: schema.reason(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "economy.remove", async () =>
                EconomyService.debit(guildId, { uuid: body.uuid, discordId: body.discordId }, body.amount),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.economy.sell,
        scope: API_SCOPES.economy,
        summary: "Settle a completed in-game sale and write the audit rows",
        tag: "Economy",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                lines: v.arrayOf(
                    v.object({ itemKey: schema.itemKey(), amount: v.number({ min: 1, integer: true }) }),
                    { min: 1, max: 64 },
                ),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "economy.sell", async () =>
                EconomyService.sell({
                    guildId,
                    uuid: body.uuid,
                    username: body.username,
                    serverId,
                    lines: body.lines,
                }),
            );

            if (!duplicate) {
                await DiscordLogService.publish({
                    guildId,
                    serverId,
                    serverName: body.serverName,
                    action: "coins_sold",
                    targetUuid: body.uuid,
                    targetUsername: body.username,
                    fields: { Coins: String((result as { credited: number }).credited) },
                    occurredAt: new Date().toISOString(),
                    requestId: body.requestId,
                });
            }

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.economy.prices,
        scope: API_SCOPES.economy,
        summary: "List the guild's item price table",
        tag: "Economy",
        handler: async context => {
            const guildId = requireGuildId(context);
            const items = await getItemPrices(guildId);

            return ok({
                guildId,
                items: items.map(item => ({
                    itemKey: item.itemKey,
                    label: item.label,
                    price: item.price,
                    enabled: item.enabled,
                })),
                revision: String(items.length),
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.economy.prices,
        scope: API_SCOPES.admin,
        summary: "Set or toggle one item price (Discord-side only)",
        tag: "Economy",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                itemKey: schema.itemKey(),
                price: v.optional(v.number({ min: MINECRAFT_PRICE_LIMITS.min, max: MINECRAFT_PRICE_LIMITS.max, integer: true })),
                enabled: v.optional(v.boolean()),
            });

            const guildId = requireGuildId(context, body.guildId);

            if (body.price !== undefined) {
                // Attributed to the key rather than to a person: a price edit through the API has
                // no Discord user behind it, and the key label is what the audit trail can act on.
                await setItemPrice(guildId, body.itemKey, body.price, context.identity.label);
            }

            invalidatePriceCache(guildId);
            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.economy.history,
        scope: API_SCOPES.economy,
        summary: "Page through sale history for a player or the whole guild",
        tag: "Economy",
        handler: async context => {
            const guildId = requireGuildId(context);
            const limit = intQueryParam(context, "limit", MINECRAFT_HISTORY_DEFAULT_LIMIT, MAX_PAGE);
            const offset = intQueryParam(context, "offset", 0, Number.MAX_SAFE_INTEGER);

            const page = await EconomyService.history({
                guildId,
                uuid: optionalQueryParam(context, "uuid"),
                discordId: optionalQueryParam(context, "discordId"),
                limit,
                offset,
            });

            return ok({ ...page, limit, offset });
        },
    },
];
