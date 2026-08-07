import { MinecraftTransaction, type IMinecraftTransaction } from "@database/models/MinecraftTransaction";

export interface MinecraftSaleTotals {
    transactions: number;
    items: number;
    coins: number;
}

export class MinecraftTransactionRepository {
    static async record(entry: {
        guildId: string;
        discordId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        itemKey: string;
        amount: number;
        coins: number;
        unitPrice: number;
        serverKey: string;
    }): Promise<IMinecraftTransaction> {
        return MinecraftTransaction.create({ ...entry, minecraftUuid: entry.minecraftUuid.toLowerCase() });
    }

    static async listByUser(guildId: string, discordId: string, limit = 10): Promise<IMinecraftTransaction[]> {
        return MinecraftTransaction.find({ guildId, discordId }).sort({ createdAt: -1 }).limit(limit);
    }

    static async listByGuild(guildId: string, limit = 10): Promise<IMinecraftTransaction[]> {
        return MinecraftTransaction.find({ guildId }).sort({ createdAt: -1 }).limit(limit);
    }

    /** Paged listing, narrowed to one member when `discordId` is given. Backs the history route. */
    static async list(
        guildId: string,
        discordId: string | undefined,
        limit: number,
        offset: number,
    ): Promise<IMinecraftTransaction[]> {
        return MinecraftTransaction.find(discordId ? { guildId, discordId } : { guildId })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);
    }

    static async count(guildId: string, discordId?: string): Promise<number> {
        return MinecraftTransaction.countDocuments(discordId ? { guildId, discordId } : { guildId });
    }

    /** Lifetime sale totals, optionally narrowed to one member. */
    static async totals(guildId: string, discordId?: string): Promise<MinecraftSaleTotals> {
        const [result] = await MinecraftTransaction.aggregate<MinecraftSaleTotals>([
            { $match: discordId ? { guildId, discordId } : { guildId } },
            {
                $group: {
                    _id: null,
                    transactions: { $sum: 1 },
                    items: { $sum: "$amount" },
                    coins: { $sum: "$coins" },
                },
            },
            { $project: { _id: 0, transactions: 1, items: 1, coins: 1 } },
        ]);

        return result ?? { transactions: 0, items: 0, coins: 0 };
    }
}
