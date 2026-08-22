import { ActivityXP, type IActivityXP } from "@database/models/ActivityXP";

export class ActivityRepository {
    static async findOrCreate(discordId: string, guildId: string, username: string): Promise<IActivityXP> {
        let record = await ActivityXP.findOne({ discordId, guildId });
        if (!record) {
            record = await ActivityXP.create({ discordId, guildId, username });
        }
        return record;
    }

    static async addXP(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { totalXP: amount, messageCount: 1 },
                lastMessageAt: new Date(),
                lastXPGrant: new Date(),
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
    }

    /**
     * Adds XP earned somewhere other than chat.
     *
     * Deliberately not addXP: that one bumps messageCount and lastMessageAt, which would make a
     * member who sat in voice all evening look like they had been talking in text channels, and
     * would corrupt the message leaderboard.
     */
    static async addNonMessageXP(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { totalXP: amount },
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
    }

    static async getLeaderboard(guildId: string, limit = 10): Promise<IActivityXP[]> {
        return ActivityXP.find({ guildId })
            .sort({ totalXP: -1 })
            .limit(limit);
    }

    static async getRank(discordId: string, guildId: string): Promise<number> {
        const user = await ActivityXP.findOne({ discordId, guildId });
        if (!user) return -1;
        const above = await ActivityXP.countDocuments({
            guildId,
            totalXP: { $gt: user.totalXP },
        });
        return above + 1;
    }

    static async updateRole(discordId: string, guildId: string, role: string): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { currentRole: role },
            { returnDocument: "after" }
        );
    }

    static async incrementRealMessageCount(discordId: string, guildId: string, username: string): Promise<IActivityXP | null> {
        await ActivityRepository.findOrCreate(discordId, guildId, username);
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { $inc: { realMessageCount: 1 } },
            { returnDocument: "after" }
        );
    }

    static async incrementSpamCount(discordId: string, guildId: string): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { $inc: { spamCount: 1 } },
            { returnDocument: "after" }
        );
    }

    static async resetSpamCount(discordId: string, guildId: string): Promise<void> {
        await ActivityXP.updateOne({ discordId, guildId }, { spamCount: 0 });
    }

    static async addSupportPoints(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { "staff.supportPoints": amount },
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
    }

    static async addModerationPoints(discordId: string, guildId: string, username: string, amount: number): Promise<IActivityXP | null> {
        await this.findOrCreate(discordId, guildId, username);
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { "staff.moderationPoints": amount },
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
    }

    static async addStaffPenalty(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { $inc: { "staff.penalties": amount } },
            { returnDocument: "after" }
        );
    }

    static async applyDecay(discordId: string, guildId: string, xpLoss: number, newLevel: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { totalXP: -xpLoss, "decay.inactiveDays": 1 },
                level: newLevel,
            },
            { returnDocument: "after" }
        );
    }

    static async getInactiveUsers(guildId: string, since: Date): Promise<IActivityXP[]> {
        return ActivityXP.find({
            guildId,
            "decay.enabled": true,
            "decay.lastActiveAt": { $lt: since },
            totalXP: { $gt: 0 },
        });
    }

    static async updateLevel(discordId: string, guildId: string, level: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { level },
            { returnDocument: "after" }
        );
    }

    static async setDecayEnabled(discordId: string, guildId: string, enabled: boolean): Promise<void> {
        await ActivityXP.updateOne({ discordId, guildId }, { "decay.enabled": enabled });
    }

    /** Members with any recorded staff points, sorted by net total (points minus penalties). */
    static async getStaffActivityOverview(
        guildId: string,
        limit = 50,
    ): Promise<Array<{ discordId: string; staff: IActivityXP["staff"]; totalStaffPoints: number }>> {
        return ActivityXP.aggregate([
            {
                $match: {
                    guildId,
                    $or: [
                        { "staff.supportPoints": { $gt: 0 } },
                        { "staff.publicChatPoints": { $gt: 0 } },
                        { "staff.staffChatPoints": { $gt: 0 } },
                        { "staff.moderationPoints": { $gt: 0 } },
                        { "staff.penalties": { $gt: 0 } },
                    ],
                },
            },
            {
                $addFields: {
                    totalStaffPoints: {
                        $subtract: [
                            {
                                $add: [
                                    "$staff.supportPoints",
                                    "$staff.publicChatPoints",
                                    "$staff.staffChatPoints",
                                    "$staff.moderationPoints",
                                ],
                            },
                            "$staff.penalties",
                        ],
                    },
                },
            },
            { $sort: { totalStaffPoints: -1 } },
            { $limit: limit },
            { $project: { _id: 0, discordId: 1, staff: 1, totalStaffPoints: 1 } },
        ]);
    }

    static async getStaffLeaderboard(guildId: string, limit = 10): Promise<IActivityXP[]> {
        return ActivityXP.find({ guildId })
            .sort({
                "staff.supportPoints": -1,
                "staff.publicChatPoints": -1,
                "staff.staffChatPoints": -1,
            })
            .limit(limit);
    }

    /** Single-element result (or empty) so id lookups and name searches share one call shape. */
    static async findByDiscordId(guildId: string, discordId: string): Promise<IActivityXP[]> {
        const record = await ActivityXP.findOne({ guildId, discordId });
        return record ? [record] : [];
    }

    /** Case-insensitive username substring match, most-active first. Backs the Activity's profile search. */
    static async searchByUsername(guildId: string, query: string, limit = 8): Promise<IActivityXP[]> {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return ActivityXP.find({ guildId, username: { $regex: escaped, $options: "i" } })
            .sort({ totalXP: -1 })
            .limit(limit);
    }

    /** Bulk username lookup used to label leaderboard rows without an N+1 query per rank. */
    static async findManyByDiscordIds(guildId: string, discordIds: string[]): Promise<IActivityXP[]> {
        if (discordIds.length === 0) return [];
        return ActivityXP.find({ guildId, discordId: { $in: discordIds } });
    }
}
