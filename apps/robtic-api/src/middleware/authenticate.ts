import { ApiError, extractBearerToken, hashApiKey, type ApiKeyIdentity } from "@sdk";
import { MinecraftApiKeyRepository } from "@database/repositories";
import { Logger } from "@logger";
import { TtlCache } from "../lib/ttl-cache";

const CTX = "robtic-api";

/**
 * Verified keys are cached briefly so a busy server does not hit Mongo on every request.
 *
 * The window is short on purpose: it bounds how long a revoked key keeps working, and revocation
 * is a security action that should take effect in seconds rather than on the next restart.
 */
const KEY_CACHE_TTL_MS = 30_000;
const keyCache = new TtlCache<ApiKeyIdentity>(KEY_CACHE_TTL_MS);

/**
 * Resolves the caller from the Authorization header.
 *
 * Only the digest is compared, so the plaintext key never has to exist in the database. A key that
 * is unknown and a key that is revoked produce the identical error, which keeps the endpoint from
 * confirming that a guessed key once existed.
 */
export async function authenticate(request: Request): Promise<ApiKeyIdentity> {
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) throw ApiError.unauthorized();

    const keyHash = await hashApiKey(token);

    const cached = keyCache.get(keyHash);
    if (cached) return cached;

    const record = await MinecraftApiKeyRepository.findActiveByHash(keyHash).catch(error => {
        Logger.error(`API key lookup failed: ${error}`, CTX);
        throw ApiError.upstream("Could not verify the API key");
    });

    if (!record) {
        // Logged without the token so a leaked log file cannot be used to authenticate.
        Logger.warn(`Rejected a request carrying an unknown or revoked API key`, CTX);
        throw ApiError.unauthorized();
    }

    const identity: ApiKeyIdentity = {
        guildId: record.guildId,
        serverId: record.serverId,
        scopes: record.scopes,
        label: record.label,
    };

    keyCache.set(keyHash, identity);
    return identity;
}

/** Drops a key from the cache so a revocation takes effect immediately rather than in 30 seconds. */
export function forgetCachedKey(keyHash: string): void {
    keyCache.invalidate(keyHash);
}
