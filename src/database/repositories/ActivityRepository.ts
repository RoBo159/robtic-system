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

    static async addStaffPublicPoints(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { "staff.publicChatPoints": amount },
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
    }

    static async addStaffChatPoints(discordId: string, guildId: string, amount: number): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            {
                $inc: { "staff.staffChatPoints": amount },
                "decay.lastActiveAt": new Date(),
                "decay.inactiveDays": 0,
            },
            { returnDocument: "after" }
        );
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

    static async getStaffLeaderboard(guildId: string, limit = 10): Promise<IActivityXP[]> {
        return ActivityXP.find({ guildId })
            .sort({
                "staff.supportPoints": -1,
                "staff.publicChatPoints": -1,
                "staff.staffChatPoints": -1,
            })
            .limit(limit);
    }
}
