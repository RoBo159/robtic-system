import { API_ROUTES, API_SCOPES, schema, validateBody } from "@sdk";
import { ok } from "../lib/respond";
import { requireGuildId, requireServerId } from "../lib/request-context";
import type { Route } from "../router";

export const API_VERSION = "2.0.0";

/**
 * The startup handshake.
 *
 * Retries are disabled on the client for this one call: if the key is wrong, retrying cannot make
 * it right, and the plugin needs a fast, unambiguous answer so it can tell staff the API is
 * misconfigured rather than merely slow.
 */
export const pluginRoutes: Route[] = [
    {
        method: "POST",
        path: API_ROUTES.plugin.auth,
        scope: API_SCOPES.server,
        summary: "Verify an API key and return the scopes it carries",
        tag: "Authentication",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            return ok({
                guildId,
                serverId,
                scopes: context.identity.scopes,
                serverTime: new Date().toISOString(),
                apiVersion: API_VERSION,
            });
        },
    },
];
