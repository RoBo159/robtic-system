import { ComboLeaderboardRepository, ComboUserStatsRepository, type ComboLeaderboardUpsert } from "@database/repositories";
import { COMBO_LEADERBOARD_PERIODS } from "@constants";
import { periodKeyFor } from "@utils";
import { favoritePartnerWeight } from "@core/combo/favorite-partner-weight";
import { getFavoritePartner } from "../combo-favorite-partner";

/** Refreshes the Favorite Partner leaderboard entries for both participants of a just-ended conversation. */
export async function recordFavoritePartnerScore(guildId: string, userAId: string, userBId: string): Promise<void> {
    const now = new Date();
    const ops: ComboLeaderboardUpsert[] = [];

    for (const userId of [userAId, userBId]) {
        const stats = await ComboUserStatsRepository.get(guildId, userId);
        const favorite = getFavoritePartner(stats);
        if (!favorite) continue;

        const value = favoritePartnerWeight(favorite);
        for (const period of COMBO_LEADERBOARD_PERIODS) {
            ops.push({ guildId, period, periodKey: periodKeyFor(period, now), type: "partner", discordId: userId, value });
        }
    }

    await ComboLeaderboardRepository.bulkUpsertMax(ops);
}
