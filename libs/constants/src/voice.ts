/**
 * Voice activity tuning.
 *
 * Everything a guild can reasonably want to change lives on VoiceSettings instead; these are the
 * fixed mechanics and the fallbacks the settings default to.
 */
export const VOICE_CONFIG = {
    /** How often connected members are evaluated. Also the unit XP and time are granted in. */
    tickIntervalMs: 60_000,
    /** How long a session may stay open with no tick before it is treated as ended (crash recovery). */
    staleSessionMs: 10 * 60_000,
    /** How often open sessions are written back, so a crash loses minutes rather than hours. */
    persistIntervalMs: 5 * 60_000,
} as const;

/** Defaults for per-guild voice settings. */
export const VOICE_DEFAULTS = {
    /** Multiplier applied when a member is the only human in the channel. */
    aloneMultiplier: 0.25,
    /** No activity for this long and voice XP stops until they do something. */
    afkTimeoutMinutes: 5,
    /** Minimum humans in a channel for the full rate. */
    minMembersForFullRate: 2,
    enabled: true,
} as const;

export const VOICE_LIMITS = {
    aloneMultiplier: { min: 0, max: 1 },
    afkTimeoutMinutes: { min: 1, max: 240 },
} as const;

/** How often cached activity timestamps are written back. */
export const ACTIVITY_FLUSH_INTERVAL_MS = 60_000;
