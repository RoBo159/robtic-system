import { PeriodicStat, type IPeriodicStat, type PeriodicStatMetric } from "@database/models/PeriodicStat";
import { COMBO_LEADERBOARD_PERIODS, type ComboLeaderboardPeriod } from "@constants";
import { periodKeyFor } from "@utils";

export class PeriodicStatRepository {
    /** Adds `amount` to every period bucket (daily/weekly/monthly/alltime) for one user's metric in one call. */
    static async incrementAllPeriods(guildId: string, metric: PeriodicStatMetric, discordId: string, amount: number, now = new Date()): Promise<void> {
        await PeriodicStat.bulkWrite(
            COMBO_LEADERBOARD_PERIODS.map(period => ({
                updateOne: {
                    filter: { guildId, period, periodKey: periodKeyFor(period, now), metric, discordId },
                    update: { $inc: { value: amount } },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    static async getTop(
        guildId: string,
        period: ComboLeaderboardPeriod,
        metric: PeriodicStatMetric,
        limit: number,
        now = new Date(),
    ): Promise<IPeriodicStat[]> {
        return PeriodicStat.find({ guildId, period, periodKey: periodKeyFor(period, now), metric })
            .sort({ value: -1 })
            .limit(limit);
    }

    /** One member's figure for the current period. Zero when they have none, which is not an error. */
    static async getValue(
        guildId: string,
        period: ComboLeaderboardPeriod,
        metric: PeriodicStatMetric,
        discordId: string,
        now = new Date(),
    ): Promise<number> {
        const row = await PeriodicStat.findOne({
            guildId,
            period,
            periodKey: periodKeyFor(period, now),
            metric,
            discordId,
        });

        return row?.value ?? 0;
    }
}
