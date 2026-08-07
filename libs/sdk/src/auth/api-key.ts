/**
 * API-key handling shared by the issuer (the bot's admin command) and the verifier (the API).
 *
 * Only the SHA-256 digest is ever stored. A leaked database therefore yields no usable key, and
 * key rotation is a matter of inserting a second digest rather than re-encrypting anything.
 */

const KEY_PREFIX = "rbtk_";
const KEY_BYTES = 32;

/** Generates a fresh key. The plaintext is returned once and never persisted. */
export function generateApiKey(): string {
    const bytes = new Uint8Array(KEY_BYTES);
    crypto.getRandomValues(bytes);
    const body = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${KEY_PREFIX}${body}`;
}

/** SHA-256 of the key, hex encoded. The only form that reaches the database. */
export async function hashApiKey(key: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Extracts the bearer token from an Authorization header, or null when absent or malformed. */
export function extractBearerToken(header: string | null): string | null {
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const token = match?.[1]?.trim();
    return token && token.length > 0 ? token : null;
}

/** Shape of a key as the API sees it after lookup. */
export interface ApiKeyIdentity {
    guildId: string;
    /** Server this key is bound to, or null for a key that may act for any server in the guild. */
    serverId: string | null;
    scopes: string[];
    label: string;
}

/** Scope names. A key missing a scope is rejected with FORBIDDEN, not UNAUTHORIZED. */
export const API_SCOPES = {
    economy: "economy",
    staff: "staff",
    server: "server",
    link: "link",
    discord: "discord",
    admin: "admin",
} as const;

export type ApiScope = typeof API_SCOPES[keyof typeof API_SCOPES];

/** The scope set a Minecraft server's key needs; anything beyond this is an admin key. */
export const PLUGIN_DEFAULT_SCOPES: ApiScope[] = [
    API_SCOPES.economy,
    API_SCOPES.staff,
    API_SCOPES.server,
    API_SCOPES.link,
    API_SCOPES.discord,
];

export function hasScope(identity: ApiKeyIdentity, scope: ApiScope): boolean {
    return identity.scopes.includes(API_SCOPES.admin) || identity.scopes.includes(scope);
}
