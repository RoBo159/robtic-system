import type { IComboLeaderboardEntry } from "@database/models";
import { ComboLeaderboardRepository } from "@database/repositories";
import { COMBO_CONFIG, type ComboLeaderboardPeriod, type ComboLeaderboardType } from "@constants";
import { periodKeyFor } from "@utils";

export async function getLeaderboard(
    guildId: string,
    period: ComboLeaderboardPeriod,
    type: ComboLeaderboardType,
    limit: number = COMBO_CONFIG.leaderboardLimit,
): Promise<IComboLeaderboardEntry[]> {
    return ComboLeaderboardRepository.getTop(guildId, period, periodKeyFor(period, new Date()), type, limit);
}
