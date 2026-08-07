/**
 * Stable machine-readable error codes shared by every Robtic API consumer.
 *
 * The string values are part of the wire contract: the Minecraft plugin branches on them to decide
 * whether a failed request is worth queueing for a retry, so renaming one is a breaking change.
 */
export const API_ERROR_CODES = {
    /** The Authorization header was missing, malformed, or named an unknown key. */
    unauthorized: "UNAUTHORIZED",
    /** The key is valid but not scoped to the guild or server the request names. */
    forbidden: "FORBIDDEN",
    /** The route exists but the addressed entity does not. */
    notFound: "NOT_FOUND",
    /** The body failed schema validation; `details` carries the offending fields. */
    validationFailed: "VALIDATION_FAILED",
    /** The caller exceeded its per-key request budget. */
    rateLimited: "RATE_LIMITED",
    /** A precondition failed, e.g. linking an account that is already linked. */
    conflict: "CONFLICT",
    /** The player is not linked to a Discord account. */
    notLinked: "NOT_LINKED",
    /** The balance cannot cover the requested debit. */
    insufficientFunds: "INSUFFICIENT_FUNDS",
    /** Mongo, Discord, or another dependency failed. Safe to retry. */
    upstreamUnavailable: "UPSTREAM_UNAVAILABLE",
    /** Anything uncaught. Safe to retry. */
    internal: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES];

/**
 * Codes whose cause is transient. The plugin's offline queue only retains a request that failed
 * with one of these — a validation error would fail identically forever and must not be requeued.
 */
export const RETRYABLE_ERROR_CODES: readonly ApiErrorCode[] = [
    API_ERROR_CODES.rateLimited,
    API_ERROR_CODES.upstreamUnavailable,
    API_ERROR_CODES.internal,
];

export function isRetryableCode(code: string): boolean {
    return (RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

/** HTTP status paired with each code, so controllers never pick a status by hand. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
    [API_ERROR_CODES.unauthorized]: 401,
    [API_ERROR_CODES.forbidden]: 403,
    [API_ERROR_CODES.notFound]: 404,
    [API_ERROR_CODES.validationFailed]: 422,
    [API_ERROR_CODES.rateLimited]: 429,
    [API_ERROR_CODES.conflict]: 409,
    [API_ERROR_CODES.notLinked]: 404,
    [API_ERROR_CODES.insufficientFunds]: 409,
    [API_ERROR_CODES.upstreamUnavailable]: 503,
    [API_ERROR_CODES.internal]: 500,
};
