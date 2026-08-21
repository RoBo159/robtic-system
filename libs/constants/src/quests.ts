/** The quest difficulties. Order is display order. */
export const QUEST_TIERS = ["easy", "normal", "hard", "golden", "vip", "special"] as const;
export type QuestTier = typeof QUEST_TIERS[number];

/**
 * Which slot a tier occupies.
 *
 * Three concurrent slots rather than one: a member chasing a week-long Golden would otherwise be
 * locked out of every daily for that week, which turns the rarest quest into a punishment.
 */
export const QUEST_SLOTS = ["short", "long", "vip", "special"] as const;
export type QuestSlot = typeof QUEST_SLOTS[number];

export const TIER_SLOT: Record<QuestTier, QuestSlot> = {
    easy: "short",
    normal: "short",
    hard: "long",
    golden: "long",
    vip: "vip",
    special: "special",
};

/** A fixed value, or a range to roll from. */
export type QuestRange = number | { min: number; max: number };

/** Rolls a `QuestRange`. A plain number is its own answer. */
export function rollQuestRange(value: QuestRange): number {
    if (typeof value === "number") return value;
    if (value.max <= value.min) return value.min;
    return value.min + Math.floor(Math.random() * (value.max - value.min + 1));
}

/** The bounds of a `QuestRange`, for display. */
export function questRangeBounds(value: QuestRange): { min: number; max: number } {
    return typeof value === "number" ? { min: value, max: value } : value;
}

export interface QuestTierSpec {
    /** How many objectives. A range for tiers that should differ from one posting to the next. */
    missions: QuestRange;
    /**
     * Points paid for completing this tier. Fixed — every quest of a tier is worth the same, so a
     * member can learn what an Easy is worth instead of finding out after they finish one.
     */
    reward: QuestRange;
    /** How many members may claim one quest of this tier. Null means unlimited. */
    slots: QuestRange | null;
    /** Inclusive lifetime range in hours, from posting. Every claim ends when the quest does. */
    durationHours: { min: number; max: number };
    /** How long past its window a missed generation is still worth firing. */
    graceHours: number;
    /**
     * How many appear per local day, rolled once per day.
     *
     * The count comes first and the times follow: the roll picks how many, then spreads them across
     * the guild's enabled windows at seeded random minutes. That is what makes a day's quests feel
     * scattered rather than clocked — three windows do not mean three quests.
     *
     * Null hands the tier to `weeklyCount` instead.
     */
    dailyCount: { min: number; max: number } | null;
    /** Rolled once a week by a planner row instead of per day. Null means the tier is daily. */
    weeklyCount: { min: number; max: number } | null;
    /**
     * Refuse to generate while one of this tier is still open.
     *
     * Off for every tier now that counts are per day: several Easy quests are expected to be
     * live at once, and exclusivity would silently cap a 4–7 roll at one.
     */
    exclusive: boolean;
    /**
     * Never generated on a schedule — an admin posts it by hand.
     *
     * The planner skips these entirely. Without the flag a tier with no daily or weekly count would
     * fall through to "one per window", which is the opposite of on-demand.
     */
    manual?: boolean;
    /**
     * Claimable regardless of what else the member is holding.
     *
     * Everything else respects one live claim per slot copy. A Special is an event: refusing it
     * because someone happens to be mid-Golden would make the rarest quest a reason to miss out.
     */
    ignoresSlotLimit?: boolean;
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  TUNING — edit `reward` and `slots` here to change what a quest pays and how
 *  many members may claim it. A plain number is fixed for every quest of that
 *  tier; a `{ min, max }` is rolled per quest, which is how Special works.
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
        dailyCount: { min: 4, max: 7 },
        weeklyCount: null,
        exclusive: false,
    },
    normal: {
        missions: 2,
        reward: 35,
        slots: 10,
        durationHours: { min: 24, max: 24 },
        graceHours: 0,
        dailyCount: { min: 1, max: 3 },
        weeklyCount: null,
        exclusive: false,
    },
    hard: {
        missions: 4,
        reward: 100,
        slots: 4,
        durationHours: { min: 72, max: 168 },
        graceHours: 24,
        dailyCount: { min: 0, max: 1 },
        weeklyCount: null,
        exclusive: false,
    },
    golden: {
        missions: 1,
        reward: 1000,
        slots: 1,
        durationHours: { min: 168, max: 168 },
        graceHours: 24,
        dailyCount: null,
        weeklyCount: { min: 0, max: 2 },
        exclusive: false,
    },
    /**
     * The admin-posted event quest. Everything about it is rolled at the moment it is posted, so no
     * two are alike, and it sits outside the slot rules so nobody has to choose between it and the
     * quest they are already on.
     */
    special: {
        missions: { min: 3, max: 7 },
        reward: { min: 200, max: 500 },
        slots: { min: 5, max: 25 },
        durationHours: { min: 6, max: 48 },
        graceHours: 0,
        dailyCount: null,
        weeklyCount: null,
        exclusive: false,
        manual: true,
        ignoresSlotLimit: true,
    },
    vip: {
        missions: 2,
        reward: 50,
        slots: null,
        durationHours: { min: 24, max: 24 },
        graceHours: 0,
        dailyCount: { min: 2, max: 2 },
        weeklyCount: null,
        exclusive: false,
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
