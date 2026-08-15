import { PointsRepository } from "@database/repositories";
import { getPointRates } from "./get-point-rates";

/**
 * Pays out when a streak reaches a rewarded day-count.
 *
 * Exact match only — a streak climbs one day at a time, so each threshold fires once per run.
 */
export async function awardStreakPoint(guildId: string, discordId: string, username: string, currentStreak: number): Promise<number> {
    const rates = await getPointRates(guildId);
    const reward = rates.streakRewards.find(r => r.streak === currentStreak);
    if (!reward || reward.points <= 0) return 0;

    await PointsRepository.move({
        guildId,
        discordId,
        username,
        amount: reward.points,
        source: "streak",
        detail: `${currentStreak} day streak`,
    });

    return reward.points;
}
