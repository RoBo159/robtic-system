import { ApiError, type ApiKeyIdentity } from "@sdk";

/**
 * Everything a controller is given. Built once by the router so a handler never re-parses the URL,
 * re-reads the body, or re-derives who the caller is.
 */
export interface RequestContext {
    request: Request;
    url: URL;
    /** The authenticated key. Present on every route except health and the OpenAPI document. */
    identity: ApiKeyIdentity;
    /** Parsed JSON body, or an empty object for a GET. */
    body: unknown;
    /** Idempotency key from the header or the body, whichever the caller supplied. */
    requestId: string | null;
    /** Server identity headers, when the caller is a game server. */
    serverId: string | null;
    serverName: string | null;
    pluginVersion: string | null;
}

/**
 * Reads `guildId` from the query string and checks it against the key.
 *
 * A key is bound to one guild, so a caller naming a different guild is refused rather than served
 * another tenant's data. Omitting the parameter is allowed and resolves to the key's own guild,
 * which is what lets the plugin leave it off entirely.
 */
export function requireGuildId(context: RequestContext, fromBody?: unknown): string {
    const candidate =
        (typeof fromBody === "string" && fromBody) || context.url.searchParams.get("guildId") || context.identity.guildId;

    if (candidate !== context.identity.guildId) {
        throw ApiError.forbidden("This API key may not act on that guild");
    }

    return candidate;
}

/**
 * Resolves which server an action belongs to, preferring the body and falling back to the header.
 * A key bound to a specific server may not claim to be a different one.
 */
export function requireServerId(context: RequestContext, fromBody?: unknown): string {
    const candidate = (typeof fromBody === "string" && fromBody) || context.serverId;

    if (!candidate) {
        throw ApiError.validation({ serverId: "is required, in the body or the x-robtic-server-id header" });
    }

    if (context.identity.serverId && context.identity.serverId !== candidate) {
        throw ApiError.forbidden("This API key is bound to a different server");
    }

    return candidate;
}

/** A required query-string parameter, as a trimmed non-empty string. */
export function queryParam(context: RequestContext, name: string): string {
    const value = context.url.searchParams.get(name)?.trim();
    if (!value) throw ApiError.validation({ [name]: "is required" });
    return value;
}

export function optionalQueryParam(context: RequestContext, name: string): string | undefined {
    return context.url.searchParams.get(name)?.trim() || undefined;
}

/** A bounded integer query parameter, so a caller cannot ask for a million rows. */
export function intQueryParam(context: RequestContext, name: string, fallback: number, max: number): number {
    const raw = context.url.searchParams.get(name);
    if (raw === null) return fallback;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw ApiError.validation({ [name]: "must be a non-negative whole number" });
    }

    return Math.min(parsed, max);
}
