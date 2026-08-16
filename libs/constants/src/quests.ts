/** The quest difficulties. Order is display order. */
export const QUEST_TIERS = ["easy", "normal", "hard", "golden", "vip"] as const;
export type QuestTier = typeof QUEST_TIERS[number];

/**
 * Which slot a tier occupies.
 *
 * Three concurrent slots rather than one: a member chasing a week-long Golden would otherwise be
 * locked out of every daily for that week, which turns the rarest quest into a punishment.
 */
export const QUEST_SLOTS = ["short", "long", "vip"] as const;
export type QuestSlot = typeof QUEST_SLOTS[number];

export const TIER_SLOT: Record<QuestTier, QuestSlot> = {
    easy: "short",
    normal: "short",
    hard: "long",
    golden: "long",
    vip: "vip",
};

export interface QuestTierSpec {
    missions: number;
    /**
     * Points paid for completing this tier. Fixed — every quest of a tier is worth the same, so a
     * member can learn what an Easy is worth instead of finding out after they finish one.
     */
    reward: number;
    /** How many members may claim one quest of this tier. Null means unlimited. */
    slots: number | null;
    /** Inclusive lifetime range in hours, from posting. Every claim ends when the quest does. */
    durationHours: { min: number; max: number };
    /** How long past its window a missed generation is still worth firing. */
    graceHours: number;
    /** Rolled once a week by a planner row instead of per window. Null means every window. */
    weeklyCount: { min: number; max: number } | null;
    /**
     * Odds that a weekly tier appears at all in a given week, 0-1.
     *
     * `weeklyCount` decides how many times a tier shows up *once it is showing up at all*; without
     * a separate chance, "1 per week" means exactly one every single week, which is a schedule
     * rather than a rarity. Rolled from the same seeded stream and persisted with the week's plan,
     * so a restart cannot re-roll a Golden into existence.
     *
     * Ignored by tiers with no `weeklyCount` — a daily is expected daily.
     */
    spawnChance: number;
    /** Refuse to generate while one of this tier is still open. */
    exclusive: boolean;
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  TUNING — edit `reward` and `slots` here to change what a quest pays and how
 *  many members may claim it. Both are fixed values, not ranges.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A change applies to quests generated afterwards. Live quests keep the reward and slot count they
 * were posted with, because members claimed them on those terms and the numbers are frozen onto
 * the quest document at generation.
 *
 * `graceHours` is the only real judgement call here: a daily quest fired hours late is worse than
 * not fired at all, but a weekly one is much better late than never.
 */
export const QUEST_TIER_SPECS: Record<QuestTier, QuestTierSpec> = {
    easy: {
        missions: 1,
        reward: 10,
        slots: 15,
        durationHours: { min: 24, max: 24 },
        graceHours: 0,
        weeklyCount: null,
        spawnChance: 1,
        exclusive: true,
    },
    normal: {
        missions: 2,
        reward: 35,
        slots: 10,
        durationHours: { min: 24, max: 24 },
        graceHours: 0,
        weeklyCount: null,
        spawnChance: 1,
        exclusive: true,
    },
    hard: {
        missions: 4,
        reward: 100,
        slots: 4,
        durationHours: { min: 72, max: 168 },
        graceHours: 24,
        weeklyCount: { min: 1, max: 2 },
        // Roughly three weeks in five carry one.
        spawnChance: 0.6,
        exclusive: true,
    },
    golden: {
        missions: 1,
        reward: 1000,
        slots: 1,
        durationHours: { min: 168, max: 168 },
        graceHours: 24,
        weeklyCount: { min: 1, max: 1 },
        // About one month in three. The rarest thing the engine can post, and it should feel it.
        spawnChance: 0.25,
        exclusive: true,
    },
    vip: {
        missions: 2,
        reward: 50,
        // Unlimited, as VIP quests are a perk rather than a race.
        slots: null,
        durationHours: { min: 24, max: 24 },
        graceHours: 0,
        weeklyCount: null,
        spawnChance: 1,
        exclusive: true,
    },
};

/** Stand-in for "unlimited" so `slotsRemaining: {$gt: 0}` works without a special case. */
export const QUEST_UNLIMITED_SLOTS = 1_000_000_000;

export const QUEST_CONFIG = {
    /** How often the engine plans, fires, expires and settles. */
    tickIntervalMs: 60_000,
    /** How often buffered progress is written back. Also the worst-case reward latency. */
    flushIntervalMs: 5_000,
    /** Force a flush once this many claims are dirty, regardless of the timer. */
    flushDirtyThreshold: 2_000,
    /** A `firing` generation row older than this is assumed crashed and retried. */
    staleFiringMs: 5 * 60_000,
    /** A `completing` claim older than this is resumed. */
    staleCompletingMs: 60_000,
    /** Generation attempts before a row is abandoned as failed. */
    maxGenerationAttempts: 5,
    /** Members held in the claim cache before the least-recently-used are dropped. */
    claimCacheMax: 50_000,
    /** How long a "this member holds nothing" cache entry is trusted. */
    negativeCacheMs: 5 * 60_000,
    /** Longer, because the answer cannot change while the feature is off. */
    disabledCacheMs: 30 * 60_000,
    /** Claims resolved per expiry batch. */
    expiryBatchSize: 500,
} as const;

/** Community challenge tuning. */
export const COMMUNITY_CONFIG = {
    /** Minimum gap between edits of the live progress embed. */
    editMinMs: 15_000,
    /** Milestones that bypass the throttle, as fractions of the target. */
    milestones: [0.25, 0.5, 0.75, 1] as const,
    /** Floor under a milestone edit, so four milestones in a burst still cannot spam. */
    milestoneFloorMs: 5_000,
    /** Contributors paid per batch at settlement. */
    settlementBatchSize: 200,
    /** Reward multipliers by finishing rank; everyone else above the floor gets 1x. */
    rankMultipliers: [3, 2, 2, 1.5, 1.5] as const,
} as const;

/** Bounds for the admin panel and the config command. */
export const QUEST_LIMITS = {
    utcOffsetMinutes: { min: -720, max: 840 },
    windowHour: { min: 0, max: 23 },
    communityRewardBase: { min: 1, max: 100_000 },
    communityMinContribution: { min: 1, max: 1_000_000 },
    maxWindows: 12,
} as const;

/** Generation windows a guild starts with — three sensible slices of an active day. */
export const DEFAULT_QUEST_WINDOWS = [
    { key: "morning", startHour: 8, endHour: 11, enabled: true },
    { key: "afternoon", startHour: 13, endHour: 16, enabled: true },
    { key: "evening", startHour: 18, endHour: 22, enabled: true },
] as const;
