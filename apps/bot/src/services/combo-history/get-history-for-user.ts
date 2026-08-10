import type { IComboHistory } from "@database/models";
import { ComboHistoryRepository } from "@database/repositories";
import { COMBO_CONFIG } from "@constants";

export async function getHistoryForUser(
    guildId: string,
    userId: string,
    limit: number = COMBO_CONFIG.historyPageSize,
): Promise<IComboHistory[]> {
    return ComboHistoryRepository.findForUser(guildId, userId, limit);
}
