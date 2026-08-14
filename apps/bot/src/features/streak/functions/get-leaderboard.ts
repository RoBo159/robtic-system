import { StreakRepository } from "@database/repositories";
import type { IStreak } from "@database/models";

export type LeaderboardMode = "current" | "best";

export async function getLeaderboard(guildId: string, mode: LeaderboardMode, limit = 5): Promise<IStreak[]> {
    return mode === "current"
        ? StreakRepository.getCurrentLeaderboard(guildId, limit)
        : StreakRepository.getBestLeaderboard(guildId, limit);
}
