import { API_ROUTES, API_SCOPES, normaliseUuid, schema, v, validateBody } from "@sdk";
import { ok } from "../lib/respond";
import { optionalQueryParam, queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { HomeService } from "../services/home-service";
import { FriendService } from "../services/friend-service";
import { SurvivalService } from "../services/survival-service";
import { SurvivalProfileService } from "../services/survival-profile-service";
import { PremiumService } from "../services/premium-service";
import type { Route } from "../router";

/**
 * Spawn, homes, friends, `/back`, chests, cosmetics and the aggregate profile.
 *
 * Every route carries the `server` scope: these are the game server's own operations, made with the
 * key issued to that server, and none of them are things a Discord-side admin key needs.
 *
 * Mutations return the state *after* the change rather than an acknowledgement, because the plugin
 * is cache-first and would otherwise have to read straight back to refresh what it just wrote.
 */

/** A world position, validated identically wherever one is accepted. */
const locationSchema = () =>
    v.object({
        world: v.string({ min: 1, max: 64 }),
        x: v.number(),
        y: v.number(),
        z: v.number(),
        yaw: v.optional(v.number()),
        pitch: v.optional(v.number()),
    });

/** Fills the optional facing so services and repositories never see a partial location. */
function location(raw: { world: string; x: number; y: number; z: number; yaw?: number; pitch?: number }) {
    return { world: raw.world, x: raw.x, y: raw.y, z: raw.z, yaw: raw.yaw ?? 0, pitch: raw.pitch ?? 0 };
}

const HOME_NAME = () => v.string({ min: 1, max: 32 });

export const survivalRoutes: Route[] = [
    // ─── Spawn ────────────────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.spawn,
        scope: API_SCOPES.server,
        summary: "Read the server's global spawn point",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));
            return ok(await SurvivalService.spawn(guildId, serverId));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.spawn,
        scope: API_SCOPES.server,
        summary: "Set the server's global spawn point (/setspawn)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                location: locationSchema(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.setSpawn", async () =>
                SurvivalService.setSpawn({
                    guildId,
                    serverKey: serverId,
                    uuid: body.uuid,
                    username: body.username,
                    location: location(body.location),
                }),
            );

            return ok(result);
        },
    },

    // ─── Homes ────────────────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.homes,
        scope: API_SCOPES.server,
        summary: "List a player's homes with the limit their tier allows",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));
            return ok(await HomeService.list(guildId, queryParam(context, "uuid"), serverId));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.setHome,
        scope: API_SCOPES.server,
        summary: "Create or move a home (/sethome)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                name: HOME_NAME(),
                location: locationSchema(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.setHome", async () =>
                HomeService.set({
                    guildId,
                    uuid: body.uuid,
                    serverKey: serverId,
                    name: body.name,
                    location: location(body.location),
                }),
            );

            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.deleteHome,
        scope: API_SCOPES.server,
        summary: "Delete a home (/delhome)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                name: HOME_NAME(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.deleteHome", async () =>
                HomeService.remove({ guildId, uuid: body.uuid, serverKey: serverId, name: body.name }),
            );

            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.renameHome,
        scope: API_SCOPES.server,
        summary: "Rename a home (/renamehome)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                from: HOME_NAME(),
                to: HOME_NAME(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.renameHome", async () =>
                HomeService.rename({
                    guildId,
                    uuid: body.uuid,
                    serverKey: serverId,
                    from: body.from,
                    to: body.to,
                }),
            );

            return ok(result);
        },
    },

    // ─── Friends ──────────────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.friends,
        scope: API_SCOPES.server,
        summary: "List friends, pending requests and the teleport preference",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            // The server passes who is currently connected, because only it knows.
            const online = (optionalQueryParam(context, "online") ?? "")
                .split(",")
                .map(value => value.trim())
                .filter(Boolean);

            return ok(await FriendService.list(guildId, queryParam(context, "uuid"), online));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.friendAction,
        scope: API_SCOPES.server,
        summary: "Add, accept, deny, cancel or remove a friend",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                action: v.oneOf(["add", "accept", "deny", "remove", "cancel"] as const),
                targetUuid: schema.uuid(),
                targetUsername: schema.username(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.friendAction", async () =>
                FriendService.act({
                    uuid: body.uuid,
                    username: body.username,
                    action: body.action,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                }),
            );

            return ok(result);
        },
    },

    // ─── Back ─────────────────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.back,
        scope: API_SCOPES.server,
        summary: "Read a player's remaining /back uses and reset time",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await SurvivalService.backBudget(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.spendBack,
        scope: API_SCOPES.server,
        summary: "Spend one /back use",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.spendBack", async () =>
                SurvivalService.spendBack(guildId, body.uuid),
            );

            return ok(result);
        },
    },

    // ─── Chests ───────────────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.locks,
        scope: API_SCOPES.server,
        summary: "List a player's locked chests",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));
            return ok(await SurvivalService.locks(guildId, queryParam(context, "uuid"), serverId));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.survival.lockAt,
        scope: API_SCOPES.server,
        summary: "Who owns the lock on one block, if anyone",
        tag: "Survival",
        handler: async context => {
            requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));

            return ok(await SurvivalService.lockAt(serverId, {
                world: queryParam(context, "world"),
                x: Number(queryParam(context, "x")),
                y: Number(queryParam(context, "y")),
                z: Number(queryParam(context, "z")),
                yaw: 0,
                pitch: 0,
            }));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.lock,
        scope: API_SCOPES.server,
        summary: "Lock a chest (/lock)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                location: locationSchema(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            return ok(await SurvivalService.lock({
                guildId,
                uuid: body.uuid,
                username: body.username,
                serverKey: serverId,
                location: location(body.location),
            }));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.unlock,
        scope: API_SCOPES.server,
        summary: "Unlock a chest (/unlock)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                location: locationSchema(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            return ok(await SurvivalService.unlock({
                guildId,
                uuid: body.uuid,
                serverKey: serverId,
                location: location(body.location),
            }));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.survival.portableChest,
        scope: API_SCOPES.server,
        summary: "Read a player's linked portable chest",
        tag: "Survival",
        handler: async context => {
            requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));
            return ok(await SurvivalService.portableChest(queryParam(context, "uuid"), serverId));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.linkChest,
        scope: API_SCOPES.server,
        summary: "Link the chest a player is looking at (/linkchest)",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                location: locationSchema(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.linkChest", async () =>
                SurvivalService.linkChest({
                    guildId,
                    uuid: body.uuid,
                    serverKey: serverId,
                    location: location(body.location),
                }),
            );

            return ok(result);
        },
    },

    // ─── Player settings ──────────────────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.settings,
        scope: API_SCOPES.server,
        summary: "Read every preference a player owns",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await SurvivalService.settings(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.setSettings,
        scope: API_SCOPES.server,
        summary: "Change one or more of a player's preferences",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                friendTpAutoAccept: v.optional(v.boolean()),
                playersVisible: v.optional(v.boolean()),
                privateProfile: v.optional(v.boolean()),
                // Nullable, not merely optional: null is how a cosmetic is cleared, and it has to
                // stay distinguishable from "not mentioned in this request".
                joinMessage: v.nullable(v.string({ max: 120 })),
                leaveMessage: v.nullable(v.string({ max: 120 })),
                particle: v.nullable(v.string({ max: 48 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            return ok(await SurvivalService.setSettings({
                guildId,
                uuid: body.uuid,
                friendTpAutoAccept: body.friendTpAutoAccept,
                playersVisible: body.playersVisible,
                privateProfile: body.privateProfile,
                joinMessage: body.joinMessage,
                leaveMessage: body.leaveMessage,
                particle: body.particle,
            }));
        },
    },

    // ─── Survival inventory preview ───────────────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.inventorySnapshot,
        scope: API_SCOPES.server,
        summary: "Read the read-only survival inventory snapshot for the lobby preview",
        tag: "Survival",
        handler: async context => {
            requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));
            return ok(await SurvivalService.inventorySnapshot(queryParam(context, "uuid"), serverId));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.inventorySnapshot,
        scope: API_SCOPES.server,
        summary: "Capture a survival inventory as the player leaves the world",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                world: v.string({ min: 1, max: 64 }),
                // Bukkit Base64 blobs. Bounded so a corrupt client cannot post an unbounded body.
                contents: v.string({ max: 200_000 }),
                armor: v.string({ max: 50_000 }),
                offhand: v.string({ max: 50_000 }),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "survival.snapshot", async () =>
                SurvivalService.putInventorySnapshot({
                    uuid: body.uuid,
                    serverKey: serverId,
                    world: body.world,
                    contents: body.contents,
                    armor: body.armor,
                    offhand: body.offhand,
                }),
            );

            return ok(result);
        },
    },

    // ─── Profile, entitlements and statistics ─────────────────────────────────────────────────
    {
        method: "GET",
        path: API_ROUTES.survival.entitlements,
        scope: API_SCOPES.server,
        summary: "Read the limits a player's premium tier allows",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await PremiumService.entitlementsOf(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.survival.profile,
        scope: API_SCOPES.server,
        summary: "The aggregate profile behind /profile and /minecraft profile",
        tag: "Survival",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context, optionalQueryParam(context, "serverId"));

            return ok(await SurvivalProfileService.of({
                guildId,
                uuid: normaliseUuid(queryParam(context, "uuid")),
                serverKey: serverId,
                online: optionalQueryParam(context, "online") === "true",
            }));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.stats,
        scope: API_SCOPES.server,
        summary: "Report a session's playtime, kills and deaths as deltas",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                playtimeMs: v.optional(v.number({ min: 0, integer: true })),
                kills: v.optional(v.number({ min: 0, integer: true })),
                deaths: v.optional(v.number({ min: 0, integer: true })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "survival.stats", async () =>
                SurvivalService.reportStats({
                    uuid: body.uuid,
                    username: body.username,
                    playtimeMs: body.playtimeMs,
                    kills: body.kills,
                    deaths: body.deaths,
                }),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.survival.afkSession,
        scope: API_SCOPES.server,
        summary: "Settle one finished AFK session: its duration and the robs it earned",
        tag: "Survival",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                // Bounded at a week. A session longer than that is a clock that moved or a snapshot
                // that outlived the process it belonged to, not somebody who stood still, and the
                // honest response to an implausible figure is to refuse it rather than to write a
                // total nobody can explain afterwards.
                afkMs: v.number({ min: 0, max: 7 * 24 * 60 * 60 * 1000, integer: true }),
                robs: v.number({ min: 0, max: 100_000, integer: true }),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            // Idempotent, and this is the route that most needs it: the other end of an AFK session
            // is often a disconnect, so the plugin queues the write and replays it after an outage.
            // Without a key that replay would pay for the same minutes a second time.
            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "survival.afk", async () =>
                SurvivalService.reportAfkSession({
                    uuid: body.uuid,
                    username: body.username,
                    afkMs: body.afkMs,
                    robs: body.robs,
                }),
            );

            return ok({ ...result, duplicate });
        },
    },
];
