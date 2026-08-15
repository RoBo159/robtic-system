/** Bounds enforced on numeric admin-config fields, mirroring the model/command limits. */
export const ADMIN_CONFIG_LIMITS = {
    streakMinMessageLength: { min: 1, max: 200 },
    punishPointsPerAction: { min: 0, max: 1000 },
    comboScorePerMessage: { min: 1, max: 100 },
    /** Cap on how many channels/roles a single multi-select field may hold. */
    maxChannelsPerField: 50,
    maxRolesPerField: 50,
} as const;

/** The role slots a guild maps in ServerConfig.roles, exposed by the admin panel. */
export const SERVER_ROLE_SLOTS = ["members", "bots", "en", "ar"] as const;

/**
 * Every writable config section, in one place.
 *
 * The API validates an incoming section against this and `AdminConfigSection` is derived from it,
 * so the two cannot drift. They already had: the route kept its own hand-written list, which was
 * missing "coins" and quietly rejected every save from that panel.
 */
export const ADMIN_CONFIG_SECTIONS = [
    "server",
    "xp",
    "streak",
    "combo",
    "punish",
    "logs",
    "points",
    "voice",
    "features",
    "rejoinRoles",
] as const;
