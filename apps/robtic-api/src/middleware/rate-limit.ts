import { API_RATE_LIMIT, ApiError } from "@sdk";

/**
 * A per-key token bucket.
 *
 * A bucket rather than a fixed window because the plugin's startup makes a burst of calls and then
 * goes quiet: a fixed window would either reject the burst or have to be set so high it stops
 * limiting anything. Tokens refill continuously at the sustained rate, so a burst is absorbed and
 * a runaway loop is still throttled.
 *
 * State is per-process. Behind multiple replicas each holds its own bucket, which multiplies the
 * effective limit by the replica count — acceptable for an internal API whose callers are known,
 * and the point where a shared store would be needed is documented here rather than discovered.
 */
interface Bucket {
    tokens: number;
    lastRefillAt: number;
}

const buckets = new Map<string, Bucket>();

/** Tokens restored per millisecond, derived so the sustained rate matches the configured budget. */
const REFILL_PER_MS = API_RATE_LIMIT.maxRequests / API_RATE_LIMIT.windowMs;

export interface RateLimitResult {
    remaining: number;
    resetInSeconds: number;
}

/**
 * Consumes one token for the key. Throws {@link ApiError.rateLimited} when the bucket is empty,
 * which the router turns into a 429 carrying `retry-after`.
 */
export function enforceRateLimit(keyLabel: string): RateLimitResult {
    const now = Date.now();
    const bucket = buckets.get(keyLabel) ?? { tokens: API_RATE_LIMIT.burst, lastRefillAt: now };

    const refilled = Math.min(
        API_RATE_LIMIT.burst,
        bucket.tokens + (now - bucket.lastRefillAt) * REFILL_PER_MS,
    );

    if (refilled < 1) {
        const waitMs = (1 - refilled) / REFILL_PER_MS;
        bucket.tokens = refilled;
        bucket.lastRefillAt = now;
        buckets.set(keyLabel, bucket);
        throw ApiError.rateLimited(Math.max(1, Math.ceil(waitMs / 1000)));
    }

    bucket.tokens = refilled - 1;
    bucket.lastRefillAt = now;
    buckets.set(keyLabel, bucket);

    return {
        remaining: Math.floor(bucket.tokens),
        resetInSeconds: Math.ceil((API_RATE_LIMIT.burst - bucket.tokens) / REFILL_PER_MS / 1000),
    };
}

/** Discards idle buckets so a long-lived process does not accumulate one entry per retired key. */
export function pruneRateLimitBuckets(): void {
    const cutoff = Date.now() - API_RATE_LIMIT.windowMs * 10;
    for (const [key, bucket] of buckets) {
        if (bucket.lastRefillAt < cutoff) buckets.delete(key);
    }
}
