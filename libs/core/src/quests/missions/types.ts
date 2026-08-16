import type { QuestMetric, MetricAccumulation } from "@core/metrics";
import type { QuestTier } from "@constants";

/**
 * A kind of objective, from which concrete missions are generated.
 *
 * Templates are the only place a mission is defined. Generators never hardcode one — they ask the
 * registry for templates eligible for a tier and roll from those, so adding an objective is one
 * file plus one registration and nothing else in the engine changes.
 */
export interface MissionTemplate {
    /** Stable key. Persisted on generated quests, so renaming one orphans history. */
    key: string;
    metric: QuestMetric;
    /**
     * How progress combines.
     *
     * `sum` for counters, `max` for levels a member reaches. Getting this wrong is silent: a
     * `comboScore` mission marked `sum` would be satisfiable by many small gains rather than by
     * actually reaching the score, and the stored numbers would look entirely reasonable.
     */
    accumulation: MetricAccumulation;
    /** Which difficulties may roll this. */
    tiers: readonly QuestTier[];
    /** The objective for a difficulty. Called once, at generation. */
    targetFor: (tier: QuestTier) => number;
    /** Human-readable objective, frozen onto the quest alongside the target. */
    label: (target: number) => string;
    /** Excluded from the weekly community challenge unless true. */
    community?: boolean;
    /** Community target, which scales with a whole server rather than one member. */
    communityTarget?: () => number;
}

/** A generated, frozen instance of a template. */
export interface GeneratedMission {
    missionId: string;
    templateKey: string;
    metric: QuestMetric;
    accumulation: MetricAccumulation;
    target: number;
    label: string;
}
