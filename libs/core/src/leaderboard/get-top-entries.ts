import { CoinsRepository, ComboLeaderboardRepository, PeriodicStatRepository, PointsRepository } from "@database/repositories";
import { TOP_DISPLAY_LIMIT, type ComboLeaderboardPeriod, type TopCategory } from "@constants";
import { periodKeyFor } from "@utils";
import type { TopEntry } from "@typings/top";
import { getStreakTopEntries } from "./get-streak-top-entries";

/** Raw ranked data for one leaderboard category+period. Rendering-free so bot embeds and the Activity share it. */
export async function getTopEntries(
    guildId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    limit = TOP_DISPLAY_LIMIT,
): Promise<TopEntry[]> {
    if (category === "combo") {
        const rows = await ComboLeaderboardRepository.getTop(
            guildId, period, periodKeyFor(period, new Date()), "combo", limit,
        );
        return rows.map(r => ({ discordId: r.discordId, value: r.value }));
    }
    if (category === "xp" || category === "messages") {
        const rows = await PeriodicStatRepository.getTop(guildId, period, category, limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.value }));
    }
    if (category === "voice") {
        // Active seconds, so the board ranks participation rather than time spent connected and idle.
        const rows = await PeriodicStatRepository.getTop(guildId, period, "voiceTime", limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.value }));
    }
    if (category === "points") {
        // A balance, not a per-period delta — every period shows the current standings.
        const rows = await PointsRepository.getTop(guildId, limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.points }));
    }
    if (category === "coins") {
        // Coin balances are cumulative — every period shows the all-time standings.
        const rows = await CoinsRepository.getTop(guildId, limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.coins }));
    }
    return getStreakTopEntries(guildId, period, limit);
}
