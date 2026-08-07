/** Request budget applied per API key. Burst is what a plugin's startup fan-out actually needs. */
export const API_RATE_LIMIT = {
    /** Rolling window the counter is measured over. */
    windowMs: 60_000,
    /** Requests one key may make inside a window. */
    maxRequests: 600,
    /** Requests allowed to arrive back-to-back before the window budget applies. */
    burst: 60,
} as const;

/** Server-side response cache TTLs, keyed by the kind of data rather than by route. */
export const API_CACHE_TTL_MS = {
    /** Price tables change rarely and are invalidated explicitly on edit. */
    prices: 60_000,
    /** Role mappings and staff rank config. */
    roles: 60_000,
    /** Lobby destinations. */
    lobbies: 300_000,
    /** Resolved account links. */
    links: 120_000,
    /**
     * Balances are deliberately absent. A cached balance can be spent twice across two servers,
     * so every read goes to Mongo — see the plugin's cache policy, which mirrors this.
     */
} as const;

/** Retry policy the SDK client applies to a transient failure. */
export const API_RETRY = {
    maxAttempts: 4,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
    /** Multiplier between attempts; delay = min(base * factor^n, max) with jitter. */
    factor: 2,
} as const;

/** Bounds on the plugin's offline queue, so a long outage cannot exhaust its heap or disk. */
export const API_QUEUE = {
    maxEntries: 5_000,
    /** A queued request older than this is dropped rather than replayed into a changed world. */
    maxAgeMs: 24 * 60 * 60 * 1000,
    /** Entries drained per flush pass once the API returns. */
    flushBatchSize: 50,
} as const;

/** How long the API remembers a request id for deduplication of a replayed queue entry. */
export const API_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Header names shared by both sides of the contract. */
export const API_HEADERS = {
    authorization: "authorization",
    requestId: "x-robtic-request-id",
    serverId: "x-robtic-server-id",
    serverName: "x-robtic-server-name",
    pluginVersion: "x-robtic-plugin-version",
    rateLimitRemaining: "x-ratelimit-remaining",
    rateLimitReset: "x-ratelimit-reset",
    retryAfter: "retry-after",
} as const;
