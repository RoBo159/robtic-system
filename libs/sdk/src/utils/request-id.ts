/**
 * Idempotency keys.
 *
 * Every mutating call carries one. The API remembers it for {@link API_IDEMPOTENCY_TTL_MS}, so a
 * request the plugin queued during an outage and replayed afterwards is applied exactly once —
 * which is what makes the offline queue safe for coin credits.
 */

/** A fresh opaque key. Prefixed with its origin so a stuck entry can be traced back in the logs. */
export function newRequestId(origin: string): string {
    return `${origin}-${crypto.randomUUID()}`;
}

/**
 * A key derived from the logical operation rather than randomly generated. Two attempts at the
 * same action produce the same key, which deduplicates a double-click as well as a replay.
 */
export function deterministicRequestId(origin: string, ...parts: (string | number)[]): string {
    return `${origin}-${parts.join(":")}`;
}
