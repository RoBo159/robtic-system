/**
 * Coins are the Discord currency, and only that. The Minecraft wallet is **robs** — a separate
 * balance in its own collection that never converts into a coin.
 *
 * Discord activity earns Points rather than coins, so there are no coin-earning rates left to
 * tune here. See points.ts for those.
 */

/** Layout templates the Activity's profile view can render. */
export const PROFILE_TEMPLATES = ["classic", "banner", "compact", "card", "minimal"] as const;
export type ProfileTemplate = typeof PROFILE_TEMPLATES[number];

/** Character cap for the self-written profile bio. */
export const PROFILE_BIO_MAX_LENGTH = 190;

/** Preset accent colors offered by the profile customizer (users may also type any hex). */
export const PROFILE_COLOR_PRESETS = [
    "#2b93ff", "#3ddc84", "#ff9142", "#9b8cff", "#ff4d5e", "#f5c518", "#00c2b2", "#e75fb3",
] as const;

/** Streak-badge tiers — must mirror the images/streak/fire<min>-<max>.png assets. */
export const BADGE_FIRE_RANGES = [
    { min: 1, max: 10 },
    { min: 11, max: 30 },
    { min: 31, max: 70 },
    { min: 71, max: 100 },
] as const;
