import { PointHistory, type IPointHistory, type PointSource } from "@database/models/PointHistory";
import { RcConversion, type IRcConversion } from "@database/models/RcConversion";

export interface PointTotals {
    earned: number;
    spent: number;
    converted: number;
    /** Earned, broken down by where it came from. */
    bySource: Record<string, number>;
}

export class PointHistoryRepository {
    static async recent(guildId: string, discordId: string, limit = 10): Promise<IPointHistory[]> {
        return PointHistory.find({ guildId, discordId }).sort({ createdAt: -1 }).limit(limit);
    }

    /**
     * Lifetime totals for one member, aggregated in the database rather than in memory — a long-
     * lived member's ledger is thousands of rows and none of them need to travel.
     */
    static async totals(guildId: string, discordId: string): Promise<PointTotals> {
        const rows = await PointHistory.aggregate<{ _id: PointSource; total: number }>([
            { $match: { guildId, discordId } },
            { $group: { _id: "$source", total: { $sum: "$amount" } } },
        ]);

        const totals: PointTotals = { earned: 0, spent: 0, converted: 0, bySource: {} };

        for (const row of rows) {
            if (row._id === "conversion") totals.converted += Math.abs(row.total);
            else if (row.total < 0) totals.spent += Math.abs(row.total);
            else {
                totals.earned += row.total;
                totals.bySource[row._id] = row.total;
            }
        }

        return totals;
    }

    static async recentConversions(guildId: string, discordId: string, limit = 10): Promise<IRcConversion[]> {
        return RcConversion.find({ guildId, discordId }).sort({ createdAt: -1 }).limit(limit);
    }
}
