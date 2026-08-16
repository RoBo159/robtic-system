import { Coin, type ICoin } from "@database/models/Coin";

/**
 * The global coin wallet.
 *
 * No guildId anywhere: one balance per person, spendable from any server and from any Minecraft
 * server on the network. Every mutation is an `$inc`, never a read-modify-write, so Discord and
 * several game servers can credit the same member concurrently without losing writes.
 */
export class CoinsRepository {
    static async findOrCreate(discordId: string, username: string): Promise<ICoin> {
        return Coin.findOneAndUpdate(
            { discordId },
            { $setOnInsert: { username } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<ICoin>;
    }

    static async get(discordId: string): Promise<ICoin | null> {
        return Coin.findOne({ discordId });
    }

    static async addCoins(discordId: string, username: string, amount: number): Promise<ICoin> {
        return Coin.findOneAndUpdate(
            { discordId },
            { $inc: { coins: amount }, $setOnInsert: { username } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<ICoin>;
    }

    static async getTop(limit = 10): Promise<ICoin[]> {
        return Coin.find({ coins: { $gt: 0 } }).sort({ coins: -1 }).limit(limit);
    }

    static async getRank(discordId: string): Promise<number> {
        const record = await Coin.findOne({ discordId });
        if (!record || record.coins <= 0) return 0;
        const above = await Coin.countDocuments({ coins: { $gt: record.coins } });
        return above + 1;
    }
}
