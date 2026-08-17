import { CoinsRepository, ComboLeaderboardRepository, PeriodicStatRepository, PointsRepository, QuestStatsRepository } from "@database/repositories";
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
    // The two halves of the XP the bot awards. Both are plain periodic counters, so a period board
    // and the all-time board come from the same query.
    if (category === "messages-xp") {
        const rows = await PeriodicStatRepository.getTop(guildId, period, "messageXp", limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.value }));
    }
    if (category === "voice-xp") {
        const rows = await PeriodicStatRepository.getTop(guildId, period, "voiceXp", limit);
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
    if (category === "quests") {
        // Lifetime completions, like points and coins — a quest can take a week to finish, so a
        // daily board would rank almost nobody and a monthly one would still cut Golden runs in half.
        const rows = await QuestStatsRepository.getTop(guildId, limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.completed }));
    }
    if (category === "coins") {
        // The only global board here: coins are one wallet per person, so this ranking is the same
        // in every server and ignores both the guild and the period.
        const rows = await CoinsRepository.getTop(limit);
        return rows.map(r => ({ discordId: r.discordId, value: r.coins }));
    }
    return getStreakTopEntries(guildId, period, limit);
}
