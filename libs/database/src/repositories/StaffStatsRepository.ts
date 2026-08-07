import { StaffStats, type IStaffStats } from "@database/models/StaffStats";
import type { StaffStatKey } from "@sdk";

export class StaffStatsRepository {
    /**
     * Bumps one counter. `$inc` with an upsert rather than a read-modify-write, so two servers
     * logging an action for the same moderator at once cannot lose one of the increments.
     */
    static async increment(
        guildId: string,
        member: { uuid: string; username: string; discordId?: string },
        key: StaffStatKey,
        by = 1,
    ): Promise<void> {
        await StaffStats.updateOne(
            { guildId, minecraftUuid: member.uuid.toLowerCase() },
            {
                $inc: { [key]: by },
                $set: { minecraftUsername: member.username, ...(member.discordId ? { discordId: member.discordId } : {}) },
            },
            { upsert: true }
        );
    }

    /** Adds a completed session's duration and counts it. Called once, when the session closes. */
    static async recordSession(
        guildId: string,
        member: { uuid: string; username: string; discordId?: string },
        durationMs: number,
    ): Promise<void> {
        await StaffStats.updateOne(
            { guildId, minecraftUuid: member.uuid.toLowerCase() },
            {
                $inc: { onDutyMs: durationMs, sessionCount: 1 },
                $set: {
                    minecraftUsername: member.username,
                    lastLoginAt: new Date(),
                    ...(member.discordId ? { discordId: member.discordId } : {}),
                },
            },
            { upsert: true }
        );
    }

    static async get(guildId: string, minecraftUuid: string): Promise<IStaffStats | null> {
        return StaffStats.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    static async leaderboard(guildId: string, limit: number, offset: number): Promise<IStaffStats[]> {
        return StaffStats.find({ guildId }).sort({ onDutyMs: -1 }).skip(offset).limit(limit);
    }

    static async count(guildId: string): Promise<number> {
        return StaffStats.countDocuments({ guildId });
    }
}
