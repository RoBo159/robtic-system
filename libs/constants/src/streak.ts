export const STREAK_CONFIG = {
    reminderThresholdMs: 2 * 60 * 60 * 1000,
    minMessageLength: 5,
    autoDeleteMs: 10_000,
    duplicateWindowMs: 10_000,
    checkIntervalMs: 15 * 60 * 1000,
} as const;

/**
 * Fallbacks for the per-guild streak windows.
 *
 * Reckoned in whole UTC calendar days, not rolling hours: a streak claimed at 23:00 is claimable
 * again at 00:00, which is how people expect a "daily" streak to behave. Only the return window is
 * in hours, because it is a staff grace period rather than part of the streak's own rhythm.
 */
export const STREAK_DEFAULTS = {
    /** Days after a claim before the next one is available. */
    claimDays: 1,
    /** Days after a claim before the streak dies. Must exceed claimDays. */
    expireDays: 2,
    /** Hours after expiry during which staff may give the streak back. */
    returnWindowHours: 24,
    /** A Discord timeout ends the streak. Covers /mute, /jail and warn auto-mutes — all timeouts. */
    breakOnTimeout: true,
    /** Being kicked ends the streak. Off by default: it is the harsher of the two. */
    breakOnKick: false,
} as const;

/** Bounds for the configurable windows, shared by the command and the admin panel. */
export const STREAK_LIMITS = {
    claimDays: { min: 1, max: 30 },
    expireDays: { min: 2, max: 60 },
    returnWindowHours: { min: 1, max: 168 },
} as const;
