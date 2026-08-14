/**
 * Defaults for the rejoin-roles feature, matching the fixed windows it replaced: a week for
 * ordinary roles, a day for staff roles.
 */
export const REJOIN_ROLES_DEFAULTS = {
    retentionHours: 168,
    staffRetentionHours: 24,
} as const;

/** Bounds for /rejoin-roles timers, so a guild cannot set a window that never expires. */
export const REJOIN_ROLES_LIMITS = {
    minHours: 1,
    maxHours: 8760,
} as const;

/** How often expired snapshots are purged. */
export const REJOIN_ROLES_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
