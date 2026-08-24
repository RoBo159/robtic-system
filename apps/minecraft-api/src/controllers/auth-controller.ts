import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { MINECRAFT_AUTH } from "@constants";
import { ok } from "../lib/respond";
import { optionalQueryParam, queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { AuthService } from "../services/auth-service";
import type { Route } from "../router";

/** Admin verbs, kept in step with `AuthAdminAction`. */
const adminAction = v.oneOf([
    "force_link",
    "force_unlink",
    "reset_password",
    "reset_session",
    "list_sessions",
] as const);

/**
 * A password on the wire.
 *
 * Bounded at both ends by the same limits the hasher enforces, so an over-long value is refused
 * before it reaches Argon2 rather than after — a megabyte of "password" is a request to spend a
 * megabyte of hashing, and that is a denial of service with a polite name.
 */
const password = v.string({
    min: MINECRAFT_AUTH.password.minLength,
    max: MINECRAFT_AUTH.password.maxLength,
});

/** A session identifier. Opaque to everything but the collection that issued it. */
const sessionId = v.string({ min: 8, max: 64 });

/**
 * The player's address, as the game server sees it.
 *
 * Bounded generously rather than pattern-matched: IPv4, IPv6 and the bracketed forms Bukkit reports
 * are all valid here, and the value is only ever hashed and compared — never parsed, never resolved,
 * never used to make a routing decision — so a shape this does not recognise can do no harm beyond
 * failing to match itself.
 */
const address = v.string({ min: 3, max: 64 });

export const authRoutes: Route[] = [
    {
        method: "GET",
        path: API_ROUTES.auth.state,
        scope: API_SCOPES.server,
        summary: "Whether a joining player is linked, has a password, and holds a live session",
        tag: "Auth",
        handler: async context => {
            const guildId = requireGuildId(context);

            return ok(
                await AuthService.state({
                    guildId,
                    uuid: queryParam(context, "uuid"),
                    username: queryParam(context, "username"),
                    serverId: context.serverId ?? undefined,
                    // Optional: a plugin that has no stored session simply omits it and is told to
                    // show the login screen.
                    sessionId: optionalQueryParam(context, "sessionId"),
                    address: optionalQueryParam(context, "address"),
                }),
            );
        },
    },
    {
        method: "POST",
        path: API_ROUTES.auth.login,
        scope: API_SCOPES.server,
        summary: "Verify a password and open a session",
        tag: "Auth",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                password,
                address: v.optional(address),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Deliberately *not* idempotent. A replayed login must be re-verified: the alternative
            // is a cached "ok" that outlives a password change, which would let a revoked credential
            // keep working for as long as the request log remembers it. Nothing here is a write the
            // player would lose to a retry — a second attempt simply checks the password again.
            return ok(
                await AuthService.login({
                    guildId,
                    uuid: body.uuid,
                    username: body.username,
                    password: body.password,
                    serverId,
                    address: body.address,
                }),
            );
        },
    },
    {
        method: "POST",
        path: API_ROUTES.auth.resumeSession,
        scope: API_SCOPES.server,
        summary: "Accept a stored session so a returning player skips the login screen",
        tag: "Auth",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                sessionId,
                address: v.optional(address),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            return ok(
                await AuthService.resume({
                    guildId,
                    uuid: body.uuid,
                    sessionId: body.sessionId,
                    serverId,
                    address: body.address,
                }),
            );
        },
    },
    {
        method: "POST",
        path: API_ROUTES.auth.logout,
        scope: API_SCOPES.server,
        summary: "End one session, or every session for a player",
        tag: "Auth",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                sessionId: v.optional(sessionId),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            // Idempotent: this is a write the plugin queues on an outage, and replaying a revocation
            // that already happened should report what the first attempt did rather than "0 ended".
            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "auth.logout", async () =>
                AuthService.logout({ guildId, uuid: body.uuid, sessionId: body.sessionId }),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.auth.recovery,
        scope: API_SCOPES.server,
        summary: "Issue the recovery code behind the login screen's Forgot Password button",
        tag: "Auth",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Idempotent on purpose, and this is the route that needs it most: issuing replaces the
            // player's outstanding code, so a retried request without a key would invalidate the
            // code they are already reading off the screen and hand them a different one.
            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "auth.recovery", async () =>
                AuthService.issueRecoveryCode({
                    guildId,
                    uuid: body.uuid,
                    username: body.username,
                    serverId,
                }),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.auth.admin,
        scope: API_SCOPES.staff,
        summary: "Force link, force unlink, reset a password, reset sessions, or list them",
        tag: "Auth",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                action: adminAction,
                uuid: schema.uuid(),
                username: schema.username(),
                discordId: v.optional(schema.snowflake()),
                actorUuid: schema.uuid(),
                actorUsername: schema.username(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            // `list_sessions` is a read and must not be served from the request log — an operator
            // running it twice wants the current answer, not the one from their previous command.
            if (body.action === "list_sessions") {
                return ok(
                    await AuthService.admin({
                        guildId,
                        action: body.action,
                        uuid: body.uuid,
                        username: body.username,
                        actorUsername: body.actorUsername,
                    }),
                );
            }

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "auth.admin", async () =>
                AuthService.admin({
                    guildId,
                    action: body.action,
                    uuid: body.uuid,
                    username: body.username,
                    discordId: body.discordId,
                    actorUsername: body.actorUsername,
                }),
            );

            return ok({ ...result, duplicate });
        },
    },
];
