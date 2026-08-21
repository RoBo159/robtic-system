import { Streak, type IStreak } from "@database/models/Streak";

export class StreakRepository {
    static async find(discordId: string, guildId: string): Promise<IStreak | null> {
        return Streak.findOne({ discordId, guildId });
    }

    static async findOrCreate(discordId: string, guildId: string, username: string): Promise<IStreak> {
        let record = await Streak.findOne({ discordId, guildId });
        if (!record) {
            record = await Streak.create({ discordId, guildId, username });
        }
        return record;
    }

    static async applyIncrement(
        discordId: string,
        guildId: string,
        currentStreak: number,
        bestStreak: number,
        messageContent: string,
    ): Promise<IStreak | null> {
        const now = new Date();
        return Streak.findOneAndUpdate(
            { discordId, guildId },
            {
                currentStreak,
                bestStreak,
                lastIncrement: now,
                lastMessageAt: now,
                lastMessageContent: messageContent,
                reminderSent: false,
                active: true,
                pendingReturnUntil: null,
            },
            { returnDocument: "after" }
        );
    }

    static async markReminderSent(discordId: string, guildId: string): Promise<void> {
        await Streak.updateOne({ discordId, guildId }, { reminderSent: true });
    }

    /**
     * Ends a streak and opens the return window.
     *
     * `pendingReturnUntil` freezes the member until staff decide or the window lapses — without it,
     * their next message would start a 1-day streak and the old one would look already replaced.
     */
    static async expire(discordId: string, guildId: string, returnWindowHours: number): Promise<void> {
        await Streak.updateOne(
            { discordId, guildId },
            {
                currentStreak: 0,
                active: false,
                reminderSent: false,
                pendingReturnUntil: new Date(Date.now() + Math.max(0, returnWindowHours) * 3_600_000),
            }
        );
    }

    static async restore(discordId: string, guildId: string, currentStreak: number, bestStreak: number): Promise<IStreak | null> {
        return Streak.findOneAndUpdate(
            { discordId, guildId },
            {
                currentStreak,
                bestStreak,
                lastIncrement: new Date(),
                reminderSent: false,
                active: true,
                pendingReturnUntil: null,
            },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async getCurrentLeaderboard(guildId: string, limit = 5): Promise<IStreak[]> {
        return Streak.find({ guildId, active: true, currentStreak: { $gt: 0 } })
            .sort({ currentStreak: -1 })
            .limit(limit);
    }

    static async getBestLeaderboard(guildId: string, limit = 5): Promise<IStreak[]> {
        return Streak.find({ guildId, bestStreak: { $gt: 0 } })
            .sort({ bestStreak: -1 })
            .limit(limit);
    }

    /** Best streak among users who incremented within `since` — backs /top's weekly/monthly streak periods. */
    static async getBestLeaderboardSince(guildId: string, since: Date, limit = 5): Promise<IStreak[]> {
        return Streak.find({ guildId, bestStreak: { $gt: 0 }, lastIncrement: { $gte: since } })
            .sort({ bestStreak: -1 })
            .limit(limit);
    }

    static async getRank(discordId: string, guildId: string): Promise<number> {
        const user = await Streak.findOne({ discordId, guildId });
        if (!user || !user.active || user.currentStreak <= 0) return -1;
        const above = await Streak.countDocuments({
            guildId,
            active: true,
            currentStreak: { $gt: user.currentStreak },
        });
        return above + 1;
    }

    static async getBestRank(discordId: string, guildId: string): Promise<number> {
        const user = await Streak.findOne({ discordId, guildId });
        if (!user || user.bestStreak <= 0) return -1;
        const above = await Streak.countDocuments({
            guildId,
            bestStreak: { $gt: user.bestStreak },
        });
        return above + 1;
    }

    /** All active streaks for a guild; exact expiry/reminder timing is evaluated in-memory since it depends on calendar-day boundaries. */
    static async findAllActive(guildId: string): Promise<IStreak[]> {
        return Streak.find({ guildId, active: true });
    }

    static async countGuild(guildId: string): Promise<number> {
        return Streak.countDocuments({ guildId });
    }

    /** Every active streak whose current value equals `value` — backs the admin `!check streak <n>` lookup. */
    static async findByCurrentStreak(guildId: string, value: number): Promise<IStreak[]> {
        return Streak.find({ guildId, active: true, currentStreak: value })
            .sort({ lastIncrement: -1 });
    }

    /**
     * Copies every streak record from sourceGuildId into destGuildId. Where a destination record
     * already exists, currentStreak/bestStreak are each kept at whichever side is higher, and the
     * rest of the record (lastIncrement/active/etc.) is taken as a whole from whichever side "won"
     * currentStreak, so the merged record's claim/expiry timing stays internally consistent.
     */
    static async bulkSyncFromGuild(
        sourceGuildId: string,
        destGuildId: string
    ): Promise<Array<{ discordId: string; currentStreak: number; bestStreak: number }>> {
        const sourceRecords = await Streak.find({ guildId: sourceGuildId });
        const synced: Array<{ discordId: string; currentStreak: number; bestStreak: number }> = [];

        for (const src of sourceRecords) {
            const dest = await Streak.findOne({ discordId: src.discordId, guildId: destGuildId });
            const base = !dest || src.currentStreak >= dest.currentStreak ? src : dest;
            const currentStreak = Math.max(src.currentStreak, dest?.currentStreak ?? 0);
            const bestStreak = Math.max(src.bestStreak, dest?.bestStreak ?? 0);

            await Streak.findOneAndUpdate(
                { discordId: src.discordId, guildId: destGuildId },
                {
                    username: base.username,
                    currentStreak,
                    bestStreak,
                    lastIncrement: base.lastIncrement,
                    lastMessageAt: base.lastMessageAt,
                    lastMessageContent: base.lastMessageContent,
                    reminderSent: base.reminderSent,
                    active: base.active,
                },
                { upsert: true }
            );

            synced.push({ discordId: src.discordId, currentStreak, bestStreak });
        }

        return synced;
    }
}
