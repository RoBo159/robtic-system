import { RobTransaction, type IRobTransaction } from "@database/models/RobTransaction";

export interface RobSaleTotals {
    transactions: number;
    items: number;
    robs: number;
}

/**
 * The ore-exchange audit trail, in robs.
 *
 * Listings are keyed by `minecraftUuid` rather than by Discord id, so a player's own history is
 * complete whether or not they have ever linked.
 */
export class RobTransactionRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async record(entry: {
        guildId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        discordId?: string | null;
        itemKey: string;
        amount: number;
        robs: number;
        unitPrice: number;
        serverKey: string;
    }): Promise<IRobTransaction> {
        return RobTransaction.create({
            ...entry,
            minecraftUuid: this.key(entry.minecraftUuid),
            discordId: entry.discordId ?? null,
        });
    }

    static async listByUuid(guildId: string, uuid: string, limit = 10): Promise<IRobTransaction[]> {
        return RobTransaction.find({ guildId, minecraftUuid: this.key(uuid) })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async listByDiscordId(guildId: string, discordId: string, limit = 10): Promise<IRobTransaction[]> {
        return RobTransaction.find({ guildId, discordId }).sort({ createdAt: -1 }).limit(limit);
    }

    static async listByGuild(guildId: string, limit = 10): Promise<IRobTransaction[]> {
        return RobTransaction.find({ guildId }).sort({ createdAt: -1 }).limit(limit);
    }

    /** Paged listing, narrowed to one player when a uuid is given. Backs the history route. */
    static async list(
        guildId: string,
        uuid: string | undefined,
        limit: number,
        offset: number,
    ): Promise<IRobTransaction[]> {
        return RobTransaction.find(uuid ? { guildId, minecraftUuid: this.key(uuid) } : { guildId })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);
    }

    static async count(guildId: string, uuid?: string): Promise<number> {
        return RobTransaction.countDocuments(uuid ? { guildId, minecraftUuid: this.key(uuid) } : { guildId });
    }

    /** Lifetime sale totals, optionally narrowed to one player. */
    static async totals(guildId: string, uuid?: string): Promise<RobSaleTotals> {
        const [result] = await RobTransaction.aggregate<RobSaleTotals>([
            { $match: uuid ? { guildId, minecraftUuid: this.key(uuid) } : { guildId } },
            {
                $group: {
                    _id: null,
                    transactions: { $sum: 1 },
                    items: { $sum: "$amount" },
                    robs: { $sum: "$robs" },
                },
            },
            { $project: { _id: 0, transactions: 1, items: 1, robs: 1 } },
        ]);

        return result ?? { transactions: 0, items: 0, robs: 0 };
    }
}
