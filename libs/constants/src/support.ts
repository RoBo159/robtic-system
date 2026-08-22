/** A claimed session with no staff activity for this long can be taken over by another staff member. */
export const CLAIM_INACTIVE_MS = 600_000;

/** Sessions untouched for this long are auto-resolved by the cleanup scheduler. */
export const STALE_SESSION_MS = 600_000;

/** How often the stale-session cleanup runs. */
export const SESSION_CLEANUP_INTERVAL_MS = 300_000;

/** Two staff talking in a support channel: reset window and message count before a reminder is sent. */
export const STAFF_CHAT_SESSION_TIMEOUT_MS = 3_600_000;
export const STAFF_CHAT_WARNING_THRESHOLD = 4;

/** Window after which a staff member's claim-intrusion strikes reset. */
export const CLAIM_INTRUSION_TIMEOUT_MS = 3_600_000;

export const SUPPORT_POINTS = {
    fastResponseMs: 60_000,
    fastResponsePoints: 5,
    normalResponseMs: 300_000,
    normalResponsePoints: 3,
    slowResponseMs: 900_000,
    slowResponsePoints: 1,
    noResponsePenalty: -2,
    claimAbandonPenalty: -3,
} as const;

/** Point values for support-session scoring. */
export const SUPPORT_SCORING = {
    speedFastPoints: 2,
    speedNormalPoints: 1,
    takeoverPenalty: -1,
    intrusionPenalty: -1,
    staffChatPenalty: -1,
} as const;
