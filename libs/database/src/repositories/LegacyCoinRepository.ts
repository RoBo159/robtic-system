import { LegacyCoin, type ILegacyCoin } from "@database/models/LegacyCoin";

/** Read and claim access to the frozen pre-global coin balances. */
export class LegacyCoinRepository {
    /** Rows a guild can still claim into points. */
    static async findClaimable(guildId: string): Promise<ILegacyCoin[]> {
        return LegacyCoin.find({ guildId, migratedAt: null, coins: { $gt: 0 } });
    }

    /** What a guild would gain by claiming, without claiming it. */
    static async summarise(guildId: string): Promise<{ members: number; coins: number }> {
        const [row] = await LegacyCoin.aggregate<{ members: number; coins: number }>([
            { $match: { guildId, migratedAt: null, coins: { $gt: 0 } } },
            { $group: { _id: null, members: { $sum: 1 }, coins: { $sum: "$coins" } } },
        ]);

        return { members: row?.members ?? 0, coins: row?.coins ?? 0 };
    }

    /**
     * Marks one row consumed. Keyed by (guildId, discordId) — the row's unique index — rather than
     * by _id, so callers never have to hold a Mongo primary key. The balance is left in place so
     * the transfer stays auditable against the PointHistory rows it produced.
     */
    static async markMigrated(guildId: string, discordId: string): Promise<void> {
        await LegacyCoin.updateOne({ guildId, discordId }, { $set: { migratedAt: new Date() } });
    }
}
