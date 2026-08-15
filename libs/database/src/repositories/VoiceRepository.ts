import { VoiceSession, VoiceStat, type IVoiceSession, type IVoiceStat } from "@database/models";

export interface SessionTotals {
    connectedSeconds: number;
    activeSeconds: number;
    xpEarned: number;
}

export class VoiceRepository {
    static async openSession(guildId: string, discordId: string, username: string, channelId: string, at: Date): Promise<IVoiceSession> {
        return VoiceSession.create({
            guildId,
            discordId,
            username,
            channelId,
            joinedAt: at,
            lastTickAt: at,
            closed: false,
        });
    }

    /**
     * Writes an open session's running totals back.
     *
     * Absolute values rather than increments: the in-memory session is the source of truth while
     * it is open, so a retried or duplicated persist cannot double-count.
     */
    static async persistSession(sessionId: string, totals: SessionTotals, lastTickAt: Date): Promise<void> {
        await VoiceSession.updateOne(
            { _id: sessionId },
            { $set: { ...totals, lastTickAt } },
        );
    }

    /** Closes a session and folds it into the member's lifetime totals in one pass. */
    static async closeSession(
        sessionId: string,
        guildId: string,
        discordId: string,
        username: string,
        totals: SessionTotals,
        endedAt: Date,
    ): Promise<void> {
        await VoiceSession.updateOne(
            { _id: sessionId, closed: false },
            { $set: { ...totals, leftAt: endedAt, lastTickAt: endedAt, closed: true } },
        );

        await VoiceStat.updateOne(
            { guildId, discordId },
            {
                $inc: {
                    totalConnectedSeconds: totals.connectedSeconds,
                    totalActiveSeconds: totals.activeSeconds,
                    totalXpEarned: totals.xpEarned,
                    sessionCount: 1,
                },
                $max: { longestSessionSeconds: totals.connectedSeconds },
                $set: { username, lastSeenAt: endedAt },
            },
            { upsert: true },
        );
    }

    /**
     * Sessions a crash left open.
     *
     * Anything still open whose last tick is older than the cutoff cannot be a live session — the
     * tick would have moved it — so it is a leftover to be closed at its last known good moment.
     */
    static async findStaleOpenSessions(cutoff: Date): Promise<IVoiceSession[]> {
        return VoiceSession.find({ closed: false, lastTickAt: { $lt: cutoff } });
    }

    static async getStat(guildId: string, discordId: string): Promise<IVoiceStat | null> {
        return VoiceStat.findOne({ guildId, discordId });
    }

    static async getTopByActiveTime(guildId: string, limit = 10): Promise<IVoiceStat[]> {
        return VoiceStat.find({ guildId }).sort({ totalActiveSeconds: -1 }).limit(limit);
    }

    static async getTopByXp(guildId: string, limit = 10): Promise<IVoiceStat[]> {
        return VoiceStat.find({ guildId }).sort({ totalXpEarned: -1 }).limit(limit);
    }

    static async getRankByActiveTime(guildId: string, discordId: string): Promise<number> {
        const record = await VoiceStat.findOne({ guildId, discordId });
        if (!record) return 0;
        return (await VoiceStat.countDocuments({ guildId, totalActiveSeconds: { $gt: record.totalActiveSeconds } })) + 1;
    }

    /** Average session length in seconds, derived rather than stored so it cannot drift. */
    static averageSessionSeconds(stat: IVoiceStat | null): number {
        if (!stat || stat.sessionCount === 0) return 0;
        return Math.round(stat.totalConnectedSeconds / stat.sessionCount);
    }
}
