import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { MINECRAFT_HISTORY_DEFAULT_LIMIT, MINECRAFT_PRICE_LIMITS } from "@constants";
import { getItemPrices, invalidatePriceCache, setItemPrice } from "@core/minecraft";
import { ok } from "../lib/respond";
import { intQueryParam, optionalQueryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { RobsService } from "../services/robs-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

const MAX_PAGE = 100;

/** How many players one batch balance read may ask about. Comfortably above a full server. */
const MAX_BATCH_UUIDS = 200;

/**
 * Robs — the Minecraft currency.
 *
 * The scope is still `economy`: it names the in-game economy these routes serve, and every API key
 * already issued to a game server carries it. Renaming the scope would silently lock out every
 * existing key, which is a migration nobody asked for.
 */
export const robsRoutes: Route[] = [
    {
        method: "GET",
        path: API_ROUTES.robs.balancePattern,
        scope: API_SCOPES.economy,
        summary: "Read a player's live robs balance",
        tag: "Robs",
        handler: async context => {
            requireGuildId(context);
            const uuid = context.url.pathname.split("/").pop() ?? "";
            return ok(await RobsService.balance(uuid));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.robs.balances,
        scope: API_SCOPES.economy,
        summary: "Read many robs balances in one call",
        tag: "Robs",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuids: v.arrayOf(schema.uuid(), { min: 1, max: MAX_BATCH_UUIDS }),
            });

            requireGuildId(context, body.guildId);
            return ok({ balances: await RobsService.balances(body.uuids) });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.robs.leaderboard,
        scope: API_SCOPES.economy,
        summary: "Read the robs leaderboard, and optionally one player's position in it",
        tag: "Robs",
        handler: async context => {
            requireGuildId(context);
            const limit = intQueryParam(context, "limit", 10, MAX_PAGE);
            return ok(await RobsService.leaderboard(limit, optionalQueryParam(context, "uuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.robs.add,
        scope: API_SCOPES.economy,
        summary: "Credit robs to a player",
        tag: "Robs",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                amount: v.number({ min: 1, integer: true }),
                reason: schema.reason(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "robs.add", async () =>
                RobsService.credit(body.uuid, body.username, body.amount),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.robs.remove,
        scope: API_SCOPES.economy,
        summary: "Debit robs from a player",
        tag: "Robs",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                amount: v.number({ min: 1, integer: true }),
                reason: schema.reason(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "robs.remove", async () =>
                RobsService.debit(body.uuid, body.username, body.amount),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.robs.sell,
        scope: API_SCOPES.economy,
        summary: "Settle a completed in-game sale and write the audit rows",
        tag: "Robs",
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

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "robs.sell", async () =>
                RobsService.sell({
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
                    fields: { Robs: String((result as { credited: number }).credited) },
                    occurredAt: new Date().toISOString(),
                    requestId: body.requestId,
                });
            }

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.robs.prices,
        scope: API_SCOPES.economy,
        summary: "List the guild's item price table",
        tag: "Robs",
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
        path: API_ROUTES.robs.prices,
        scope: API_SCOPES.admin,
        summary: "Set or toggle one item price (Discord-side only)",
        tag: "Robs",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                itemKey: schema.itemKey(),
                price: v.optional(v.number({ min: MINECRAFT_PRICE_LIMITS.min, max: MINECRAFT_PRICE_LIMITS.max, integer: true })),
                enabled: v.optional(v.boolean()),
            });

            const guildId = requireGuildId(context, body.guildId);

            if (body.price !== undefined) {
                await setItemPrice(guildId, body.itemKey, body.price, context.identity.label);
            }

            invalidatePriceCache(guildId);
            return ok({ acknowledged: true as const });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.robs.history,
        scope: API_SCOPES.economy,
        summary: "Page through sale history for a player or the whole guild",
        tag: "Robs",
        handler: async context => {
            const guildId = requireGuildId(context);
            const limit = intQueryParam(context, "limit", MINECRAFT_HISTORY_DEFAULT_LIMIT, MAX_PAGE);
            const offset = intQueryParam(context, "offset", 0, Number.MAX_SAFE_INTEGER);

            const page = await RobsService.history({
                guildId,
                uuid: optionalQueryParam(context, "uuid"),
                limit,
                offset,
            });

            return ok({ ...page, limit, offset });
        },
    },
];
