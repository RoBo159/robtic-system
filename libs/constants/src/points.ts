/** Fallback economy rates when a guild has not configured its own. */
export const POINT_DEFAULTS = {
    messagesPerPoint: 100,
    comboPerPoint: 100,
    /** Minutes of *active* voice per Point — voice is slower than chat by design. */
    voiceMinutesPerPoint: 10,
    pointsPerRc: 100,
    minConversionPoints: 100,
} as const;

/** Bounds for the admin panel's economy fields. */
export const POINT_RATE_LIMITS = { min: 1, max: 100_000 } as const;
export const RC_RATE_LIMITS = { min: 1, max: 1_000_000 } as const;

/** Most streak→points reward rows a guild may configure. */
export const POINT_STREAK_REWARDS_MAX = 15;

/** How many ledger rows `/points history` shows. */
export const POINT_HISTORY_PAGE_SIZE = 10;
