import type { QuestMetric, MetricAccumulation } from "@core/metrics";
import type { IQuestClaim } from "@database/models";
import type { QuestTier, QuestSlot } from "@constants";

/** One mission of one live claim, as the intake path sees it. */
export interface MissionRuntime {
    missionId: string;
    metric: QuestMetric;
    accumulation: MetricAccumulation;
    target: number;
    /** Last value known to be in the database. */
    persisted: number;
    /** Unflushed: a delta for `sum`, a high-water mark for `max`. */
    pending: number;
    done: boolean;
}

/** One live claim, with a precomputed index so intake never scans mission lists. */
export interface ClaimRuntime {
    claimId: string;
    questId: string;
    guildId: string;
    discordId: string;
    username: string;
    tier: QuestTier;
    slot: QuestSlot;
    expiresAt: number;
    missions: MissionRuntime[];
    /** metric → the missions that care. Usually a miss, which is the point. */
    byMetric: Map<QuestMetric, MissionRuntime[]>;
    /** Missions still outstanding. Reaching zero is what triggers a completion check. */
    remaining: number;
}

/** The effective value of a mission right now: persisted plus whatever has not been written yet. */
export function effectiveValue(mission: MissionRuntime): number {
    return mission.accumulation === "sum"
        ? mission.persisted + mission.pending
        : Math.max(mission.persisted, mission.pending);
}

/** Builds the in-memory view of a stored claim. */
export function toRuntime(claim: IQuestClaim): ClaimRuntime {
    const missions: MissionRuntime[] = claim.missions.map(mission => {
        const persisted = claim.progress?.[mission.missionId] ?? 0;

        return {
            missionId: mission.missionId,
            metric: mission.metric as QuestMetric,
            accumulation: mission.accumulation,
            target: mission.target,
            persisted,
            pending: 0,
            done: persisted >= mission.target,
        };
    });

    const byMetric = new Map<QuestMetric, MissionRuntime[]>();
    for (const mission of missions) {
        const existing = byMetric.get(mission.metric);
        if (existing) existing.push(mission);
        else byMetric.set(mission.metric, [mission]);
    }

    return {
        claimId: String(claim._id),
        questId: String(claim.questId),
        guildId: claim.guildId,
        discordId: claim.discordId,
        username: claim.username,
        tier: claim.tier,
        slot: claim.slot,
        expiresAt: claim.expiresAt.getTime(),
        missions,
        byMetric,
        remaining: missions.filter(mission => !mission.done).length,
    };
}

/** The thresholds every mission must meet, for the completion lease's filter. */
export function thresholdsOf(runtime: ClaimRuntime): Record<string, number> {
    return Object.fromEntries(runtime.missions.map(mission => [mission.missionId, mission.target]));
}
