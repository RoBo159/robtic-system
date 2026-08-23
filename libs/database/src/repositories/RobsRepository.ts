import { Rob, type IRob } from "@database/models/Rob";

/**
 * Robs, the Minecraft currency, addressed by Minecraft UUID.
 *
 * Every mutation is an `$inc`, never a read-modify-write, so several game servers can credit the
 * same player concurrently without losing a payout.
 *
 * Nothing here consults `MinecraftLink`. That is the point: a UUID is already the key, so a balance
 * read costs one indexed query and works for a player who has never linked Discord.
 */
export class RobsRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async get(uuid: string): Promise<IRob | null> {
        return Rob.findOne({ minecraftUuid: this.key(uuid) });
    }

    static async findOrCreate(uuid: string, username: string): Promise<IRob> {
        return Rob.findOneAndUpdate(
            { minecraftUuid: this.key(uuid) },
            { $setOnInsert: { username } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IRob>;
    }

    /**
     * Applies a delta and returns the row afterwards.
     *
     * `username` is refreshed on every call rather than only on insert, so a name change shows up
     * on the leaderboard without a separate sync.
     */
    static async addRobs(uuid: string, username: string, amount: number): Promise<IRob> {
        return Rob.findOneAndUpdate(
            { minecraftUuid: this.key(uuid) },
            { $inc: { robs: amount }, $set: { username } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IRob>;
    }

    /**
     * Debits only if the balance covers it, in one atomic operation.
     *
     * The balance check is part of the query rather than a preceding read: two concurrent debits
     * that each passed a separate check could otherwise both apply and drive the balance negative.
     * A null return means "not enough robs", which is the caller's cue to refuse the purchase.
     */
    static async tryDebit(uuid: string, username: string, amount: number): Promise<IRob | null> {
        return Rob.findOneAndUpdate(
            { minecraftUuid: this.key(uuid), robs: { $gte: amount } },
            { $inc: { robs: -amount }, $set: { username } },
            { returnDocument: "after" }
        );
    }

    /** Records the linked Discord id, for display only. Never used to resolve a balance. */
    static async attachDiscordId(uuid: string, discordId: string | null): Promise<void> {
        await Rob.updateOne({ minecraftUuid: this.key(uuid) }, { $set: { discordId } });
    }

    /**
     * Balances for many players in one query.
     *
     * This is what lets the placeholder refresh cost a single request per pass rather than one per
     * online player — see the plugin's batch balance endpoint.
     */
    static async getMany(uuids: string[]): Promise<IRob[]> {
        if (uuids.length === 0) return [];
        return Rob.find({ minecraftUuid: { $in: uuids.map(uuid => this.key(uuid)) } });
    }

    static async getTop(limit = 10): Promise<IRob[]> {
        return Rob.find({ robs: { $gt: 0 } }).sort({ robs: -1 }).limit(limit);
    }

    static async getRank(uuid: string): Promise<number> {
        const record = await this.get(uuid);
        if (!record || record.robs <= 0) return 0;
        const above = await Rob.countDocuments({ robs: { $gt: record.robs } });
        return above + 1;
    }
}
