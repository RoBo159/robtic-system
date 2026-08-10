import type { ICombo } from "@database/models";
import { ComboRepository, ComboUserStatsRepository } from "@database/repositories";
import { Logger } from "@logger";
import { checkFinalRecords } from "../combo-records";
import { recordEndedCombo } from "../combo-history";
import { recordFavoritePartnerScore } from "../combo-leaderboard";
import { rollConversationStreak } from "../combo-streak-service";

const CTX = "main:combo";

/**
 * Archives an ended conversation: rolls the conversation streak forward, writes history, updates
 * both participants' aggregate stats, and checks server records/leaderboard entries that only
 * finalize at combo-end. Idempotent — safe to call from both the lazy per-message path and the
 * periodic scheduler without double-processing (guarded by pair.status).
 */
export async function finalizeCombo(pair: ICombo): Promise<void> {
    if (pair.status === "ended") return;

    const now = new Date();
    const userAId = pair.userLowId;
    const userBId = pair.userHighId;

    // A pair that never actually exchanged a qualifying message shouldn't count as a conversation day.
    const roll = pair.messages > 0
        ? rollConversationStreak(pair.streakCurrent, pair.streakBest, pair.lastStreakDateKey, now)
        : { streakCurrent: pair.streakCurrent, streakBest: pair.streakBest, dateKey: pair.lastStreakDateKey };
    const { streakCurrent, streakBest, dateKey } = roll;

    await ComboRepository.endWithStreak(pair.guildId, userAId, userBId, streakCurrent, streakBest, dateKey);

    if (pair.messages === 0) return;

    try {
        await recordEndedCombo(pair, now);
        await ComboUserStatsRepository.applyComboEnd(pair.guildId, userAId, userBId, {
            score: pair.currentScore,
            durationMs: pair.totalDurationMs,
            messages: pair.messages,
            streakCurrent,
        });
        await checkFinalRecords(pair.guildId, pair, userAId, userBId, streakCurrent);
        await recordFavoritePartnerScore(pair.guildId, userAId, userBId);
    } catch (err) {
        Logger.error(`Failed to finalize combo ${pair.guildId}:${userAId}:${userBId}: ${err}`, CTX);
    }
}
