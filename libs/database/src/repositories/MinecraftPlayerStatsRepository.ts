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

    /** Today in UTC, as the `yyyy-MM-dd` key both this and the game servers store. */
    static todayKey(at: Date = new Date()): string {
        return at.toISOString().slice(0, 10);
    }

    /**
     * Records one finished AFK session.
     *
     * <h2>Written as an aggregation pipeline, for the day rollover</h2>
     *
     * "Today's AFK time" cannot be a plain `$inc`: the increment has to *replace* the total when the
     * stored day is not today and add to it when it is, and which of those applies is a property of
     * the document being written. Reading the row first and deciding in TypeScript would open the
     * window this whole repository exists to avoid — two servers settling the same player's session
     * at once would both read the same figure and the second would overwrite the first.
     *
     * A pipeline update evaluates the condition inside the write, on the server, so the rollover and
     * the increment are one atomic operation and stay correct however many servers are running.
     *
     * The lifetime figures alongside it are ordinary increments for the same reason they always
     * were: the game server reports what one session was worth, never what the total should become.
     */
    static async recordAfkSession(input: {
        uuid: string;
        username: string;
        afkMs: number;
        robs: number;
        at?: Date;
    }): Promise<IMinecraftPlayerStats> {
        const seenAt = input.at ?? new Date();
        const day = this.todayKey(seenAt);
        const afkMs = Math.max(0, Math.round(input.afkMs));
        const robs = Math.max(0, Math.round(input.robs));

        return MinecraftPlayerStats.findOneAndUpdate(
            { minecraftUuid: this.key(input.uuid) },
            [
                {
                    $set: {
                        username: input.username,
                        lastSeenAt: seenAt,
                        firstJoinAt: { $ifNull: ["$firstJoinAt", seenAt] },

                        afkTotalMs: { $add: [{ $ifNull: ["$afkTotalMs", 0] }, afkMs] },
                        afkRobs: { $add: [{ $ifNull: ["$afkRobs", 0] }, robs] },

                        afkTodayMs: {
                            $cond: [
                                { $eq: [{ $ifNull: ["$afkTodayDate", ""] }, day] },
                                { $add: [{ $ifNull: ["$afkTodayMs", 0] }, afkMs] },
                                afkMs,
                            ],
                        },
                        afkTodayDate: day,
                    },
                },
            ],
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftPlayerStats>;
    }
}
