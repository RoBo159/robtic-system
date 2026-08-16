/**
 * How a feature's value is read.
 *
 * The type is what lets one configuration command set every feature: `/premium feature set` reads
 * the type and validates the number it was given, instead of carrying a branch per feature.
 */
export const PREMIUM_VALUE_TYPES = ["flag", "percent", "count", "duration"] as const;
export type PremiumValueType = typeof PREMIUM_VALUE_TYPES[number];

/**
 * What happens when a member holds roles from several tiers at once.
 *
 * `highest` is the default and the right answer for almost everything: someone with Prime and
 * Prime Pro gets Prime Pro's bonus, not both. `sum` exists for genuinely additive perks — an extra
 * quest slot from two sources really is two slots — and is opt-in per feature so nothing becomes
 * stackable by accident.
 */
export const PREMIUM_STACKING = ["highest", "sum", "max"] as const;
export type PremiumStacking = typeof PREMIUM_STACKING[number];

export const PREMIUM_CONFIG = {
    /** Per-guild tier and feature configuration. Read on every benefit lookup that misses. */
    configCacheMs: 60_000,
    /** A resolved member's benefits. Short, because a role change between ticks must not linger. */
    memberCacheMs: 30_000,
    /** Members held before the least-recently-used are dropped. */
    memberCacheMax: 20_000,
    /** Tiers a guild may define. */
    maxTiers: 20,
    /** Discord roles that may point at one tier. */
    maxRolesPerTier: 25,
    /** Bounds for `/premium feature set` on percent-typed features. */
    percentRange: { min: -100, max: 1000 },
    /** Bounds for count-typed features. */
    countRange: { min: 0, max: 100 },
    /** Bounds for duration-typed features, in hours. */
    durationHoursRange: { min: 0, max: 720 },
} as const;

/** Tier a guild gets when it runs `/premium setup` — a sensible three-step ladder, all editable. */
export const PREMIUM_STARTER_TIERS = [
    { key: "prime", name: "Prime", rank: 10 },
    { key: "prime-plus", name: "Prime+", rank: 20 },
    { key: "prime-pro", name: "Prime Pro", rank: 30 },
] as const;
