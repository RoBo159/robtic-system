import {
    QuestStatsRepository,
    QuestClaimRepository,
    CommunityChallengeRepository,
} from "@database/repositories";

/** One member's quest record, as every profile surface reads it. */
export interface QuestSummary {
    claimed: number;
    completed: number;
    failed: number;
    /** Percentage of *resolved* claims that were completed, 0-100. */
    completionRate: number;
    rank: number;
    pointsEarned: number;
    easyCompleted: number;
    normalCompleted: number;
    hardCompleted: number;
    goldenCompleted: number;
    vipCompleted: number;
    communityCompleted: number;
    /** Everything contributed to weekly challenges, across every week. */
    communityContribution: number;
    firstPlaceFinishes: number;
    fastestCompletionMs: number | null;
    /** Mean completion time, or null with no completions. */
    averageCompletionMs: number | null;
    lastCompletedAt: number | null;
    /** How many quests they are on right now — at most one per slot. */
    activeClaims: number;
}

const EMPTY: QuestSummary = {
    claimed: 0,
    completed: 0,
    failed: 0,
    completionRate: 0,
    rank: 0,
    pointsEarned: 0,
    easyCompleted: 0,
    normalCompleted: 0,
    hardCompleted: 0,
    goldenCompleted: 0,
    vipCompleted: 0,
    communityCompleted: 0,
    communityContribution: 0,
    firstPlaceFinishes: 0,
    fastestCompletionMs: null,
    averageCompletionMs: null,
    lastCompletedAt: null,
    activeClaims: 0,
};

/**
 * The single read behind `/quest stats`, the profile field, the profile tab and the snapshot.
 *
 * A member with no record is not an error — it is the normal state of everyone who has not claimed
 * a quest yet — so this returns zeroes rather than null and no caller has to branch.
 *
 * Rank is only looked up when they have completed something: `getRank` counts documents, and doing
 * that for every member who has never touched a quest would be a scan for a guaranteed zero.
 */
export async function getQuestSummary(guildId: string, discordId: string): Promise<QuestSummary> {
    const [record, activeClaims, communityContribution] = await Promise.all([
        QuestStatsRepository.get(guildId, discordId),
        QuestClaimRepository.findActiveForMember(guildId, discordId),
        CommunityChallengeRepository.lifetimeContribution(guildId, discordId),
    ]);

    if (!record) return { ...EMPTY, activeClaims: activeClaims.length, communityContribution };

    // Active claims are neither completed nor failed, so the rate is measured against what actually
    // resolved — otherwise a quest still in progress reads as a failure.
    const resolved = record.completed + record.failed;

    return {
        claimed: record.claimed,
        completed: record.completed,
        failed: record.failed,
        completionRate: resolved > 0 ? Math.round((record.completed / resolved) * 100) : 0,
        rank: record.completed > 0 ? await QuestStatsRepository.getRank(guildId, discordId) : 0,
        pointsEarned: record.pointsEarned,
        easyCompleted: record.easyCompleted,
        normalCompleted: record.normalCompleted,
        hardCompleted: record.hardCompleted,
        goldenCompleted: record.goldenCompleted,
        vipCompleted: record.vipCompleted,
        communityCompleted: record.communityCompleted,
        communityContribution,
        firstPlaceFinishes: record.firstPlaceFinishes,
        fastestCompletionMs: record.fastestCompletionMs,
        averageCompletionMs: record.completed > 0 ? record.totalCompletionMs / record.completed : null,
        lastCompletedAt: record.lastCompletedAt?.getTime() ?? null,
        activeClaims: activeClaims.length,
    };
}
