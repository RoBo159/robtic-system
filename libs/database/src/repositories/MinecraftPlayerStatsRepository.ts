import { MinecraftPlayerStats, type IMinecraftPlayerStats } from "@database/models/MinecraftPlayerStats";

/**
 * Lifetime play statistics.
 *
 * Every mutation is an `$inc` against a delta the game server reports, never a write of a total.
 * Two servers can then credit the same player at once without either overwriting the other — the
 * same reason the robs balance works this way.
 */
export class MinecraftPlayerStatsRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async get(uuid: string): Promise<IMinecraftPlayerStats | null> {
        return MinecraftPlayerStats.findOne({ minecraftUuid: this.key(uuid) });
    }

    static async getMany(uuids: string[]): Promise<IMinecraftPlayerStats[]> {
        if (uuids.length === 0) return [];
        return MinecraftPlayerStats.find({ minecraftUuid: { $in: uuids.map(uuid => this.key(uuid)) } });
    }

    /**
     * Records a session's worth of activity.
     *
     * `firstJoinAt` is `$setOnInsert` so it keeps the value from the very first join forever, while
     * `lastSeenAt` is overwritten every time.
     */
    static async record(input: {
        uuid: string;
        username: string;
        playtimeMs?: number;
        kills?: number;
        deaths?: number;
        jailCount?: number;
        seenAt?: Date;
    }): Promise<IMinecraftPlayerStats> {
        const increments: Record<string, number> = {};
        if (input.playtimeMs) increments.playtimeMs = input.playtimeMs;
        if (input.kills) increments.kills = input.kills;
        if (input.deaths) increments.deaths = input.deaths;
        if (input.jailCount) increments.jailCount = input.jailCount;

        const seenAt = input.seenAt ?? new Date();

        return MinecraftPlayerStats.findOneAndUpdate(
            { minecraftUuid: this.key(input.uuid) },
            {
                ...(Object.keys(increments).length > 0 ? { $inc: increments } : {}),
                $set: { username: input.username, lastSeenAt: seenAt },
                $setOnInsert: { firstJoinAt: seenAt },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftPlayerStats>;
    }
}
