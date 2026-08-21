import { CommunityChallengeRepository, PointsRepository, QuestStatsRepository } from "@database/repositories";
import type { ICommunityChallenge } from "@database/models";
import { COMMUNITY_CONFIG } from "@constants";
import { Logger } from "@logger";

const CTX = "quests";

export interface SettlementResult {
    paid: number;
    totalPoints: number;
    completed: boolean;
}

/** Payment key for a community reward. Stable across retries and resumes. */
export const communityPayoutKey = (weekKey: string, discordId: string): string =>
    `community:${weekKey}:${discordId}`;

/**
 * Pays out a finished challenge.
 *
 * Everyone at or above the floor gets the base reward; the top five get a multiplier on top. The
 * floor exists because "base for every contributor" with no minimum means a one-message drive-by is
 * paid and a fifty-thousand-member guild owes fifty thousand rewards.
 *
 * Resumable: contributors are walked by `_id` and the cursor is saved every batch, so a crash
 * halfway through picks up where it stopped instead of starting over. The idempotency key makes
 * restarting safe either way — the cursor just makes it fast.
 */
export async function settleChallenge(challenge: ICommunityChallenge): Promise<SettlementResult> {
    const completed = challenge.total >= challenge.target;
    const result: SettlementResult = { paid: 0, totalPoints: 0, completed };

    if (!completed) {
        await CommunityChallengeRepository.markSettled(challenge._id);
        return result;
    }

    const top = await CommunityChallengeRepository.topContributors(challenge.guildId, challenge.weekKey, 5);
    const rankOf = new Map(top.map((row, index) => [row.discordId, index]));

    let cursor = challenge.settledCursor;

    for (;;) {
        const batch = await CommunityChallengeRepository.payableAfter(
            challenge.guildId,
            challenge.weekKey,
            challenge.minContribution,
            cursor,
            COMMUNITY_CONFIG.settlementBatchSize,
        );

        if (batch.length === 0) break;

        for (const row of batch) {
            const rankIndex = rankOf.get(row.discordId);
            const multiplier = rankIndex === undefined
                ? 1
                : COMMUNITY_CONFIG.rankMultipliers[rankIndex] ?? 1;

            const reward = Math.round(challenge.rewardBase * multiplier);

            try {
                await PointsRepository.move({
                    guildId: challenge.guildId,
                    discordId: row.discordId,
                    username: row.username,
                    amount: reward,
                    source: "community",
                    detail: `${challenge.weekKey} challenge`,
                    idempotencyKey: communityPayoutKey(challenge.weekKey, row.discordId),
                });

                await CommunityChallengeRepository.recordPayout(row._id, reward);
                await QuestStatsRepository.recordCommunityCompletion(
                    challenge.guildId, row.discordId, row.username, reward,
                ).catch(() => null);

                result.paid++;
                result.totalPoints += reward;
            } catch (err) {
                Logger.warn(`Could not pay community reward to ${row.discordId}: ${err}`, CTX);
            }
        }

        cursor = batch[batch.length - 1]!._id;
        await CommunityChallengeRepository.advanceCursor(challenge._id, cursor);

        if (batch.length < COMMUNITY_CONFIG.settlementBatchSize) break;
    }

    await CommunityChallengeRepository.markSettled(challenge._id);
    Logger.info(
        `Settled ${challenge.weekKey} for ${challenge.guildId}: ${result.paid} paid, ${result.totalPoints} points`,
        CTX,
    );

    return result;
}
