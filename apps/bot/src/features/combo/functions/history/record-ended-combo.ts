import type { ICombo, IComboHistory } from "@database/models";
import { ComboHistoryRepository } from "@database/repositories";

export async function recordEndedCombo(pair: ICombo, endedAt: Date): Promise<IComboHistory> {
    return ComboHistoryRepository.create({
        guildId: pair.guildId,
        userAId: pair.userLowId,
        userBId: pair.userHighId,
        score: pair.currentScore,
        level: pair.level,
        durationMs: pair.totalDurationMs,
        messages: pair.messages,
        endedAt,
    });
}
