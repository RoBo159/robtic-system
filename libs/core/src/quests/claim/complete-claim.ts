import {
    QuestRepository,
    QuestClaimRepository,
    QuestStatsRepository,
    PointsRepository,
} from "@database/repositories";
import type { IQuestClaim } from "@database/models";
import { Logger } from "@logger";
import { invalidateMemberClaims } from "../progress/claim-cache";
import { thresholdsOf, type ClaimRuntime } from "../progress/runtime";
import { announceCompleted } from "../notify";
import { getMultiplier, PremiumFeature } from "@core/premium";

const CTX = "quests";

export interface CompletionResult {
    completed: boolean;
    reward: number;
    rank: number;
}

/** Payment key for a quest reward. Stable across retries, unique per member per quest. */
export const questPayoutKey = (questId: string, discordId: string): string =>
    `quest:${questId}:${discordId}`;

/**
 * Confirms and pays a finished claim.
 *
 * Three steps, in an order that matters:
 *
 *  1. **Lease** — compare-and-swap the claim out of `active`, with every mission threshold in the
 *     filter. This is both the authoritative re-check against the database (rather than the
 *     possibly-optimistic in-memory shadow) and the exclusive transition, so exactly one worker can
 *     ever proceed. A stale or admin-reset progress value simply fails to match.
 *  2. **Rank** — allocated only by the lease winner, so a retried detection cannot burn numbers.
 *  3. **Pay** — through the normal economy with an idempotency key, then seal.
 *
 * A crash after the lease leaves the claim in `completing`; the tick resumes it, and because the
 * payment is keyed it cannot pay twice.
 */
export async function completeClaim(runtime: ClaimRuntime): Promise<CompletionResult> {
    const crossedAt = new Date();

    const leased = await QuestClaimRepository.leaseCompletion(
        runtime.claimId,
        thresholdsOf(runtime),
        crossedAt,
    );

    if (!leased) return { completed: false, reward: 0, rank: 0 };

    return finishLeasedClaim(leased);
}

/**
 * Finishes a claim already leased into `completing`.
 *
 * Shared by the live path and the tick that resumes claims a crash left behind, so both pay through
 * exactly the same code and the same key.
 */
export async function finishLeasedClaim(claim: IQuestClaim): Promise<CompletionResult> {
    const quest = await QuestRepository.findById(claim.questId);
    const base = quest?.reward ?? 0;

    const bonus = await getMultiplier(claim.guildId, claim.discordId, PremiumFeature.QUEST_REWARD_BONUS);
    const reward = Math.round(base * bonus);

    const rank = await QuestRepository.nextCompletionRank(claim.questId);

    if (reward > 0) {
        try {
            await PointsRepository.move({
                guildId: claim.guildId,
                discordId: claim.discordId,
                username: claim.username,
                amount: reward,
                source: "quest",
                detail: `${claim.tier} quest`,
                idempotencyKey: questPayoutKey(String(claim.questId), claim.discordId),
            });
        } catch (err) {
            Logger.error(`Could not pay quest reward to ${claim.discordId}: ${err}`, CTX);
            return { completed: false, reward: 0, rank };
        }
    }

    await QuestClaimRepository.finishCompletion(claim, rank, reward);

    const durationMs = Date.now() - claim.claimedAt.getTime();
    await QuestStatsRepository.recordCompletion({
        guildId: claim.guildId,
        discordId: claim.discordId,
        username: claim.username,
        tier: claim.tier,
        durationMs,
        reward,
        firstPlace: rank === 1,
    }).catch(err => Logger.warn(`Could not record quest completion stat: ${err}`, CTX));

    invalidateMemberClaims(claim.guildId, claim.discordId);

    announceCompleted({
        guildId: claim.guildId,
        discordId: claim.discordId,
        username: claim.username,
        tier: claim.tier,
        questId: String(claim.questId),
        claimId: String(claim._id),
        missions: claim.missions.map(mission => ({
            label: mission.label,
            target: mission.target,
            progress: claim.progress?.[mission.missionId] ?? mission.target,
        })),
        reward,
        rank,
        durationMs,
    });

    Logger.debug(`${claim.discordId} completed a ${claim.tier} quest (rank ${rank}, ${reward} points)`, CTX);
    return { completed: true, reward, rank };
}
