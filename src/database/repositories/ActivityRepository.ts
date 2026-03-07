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
            },
            { new: true }
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
            { new: true }
        );
    }

    static async incrementSpamCount(discordId: string, guildId: string): Promise<IActivityXP | null> {
        return ActivityXP.findOneAndUpdate(
            { discordId, guildId },
            { $inc: { spamCount: 1 } },
            { new: true }
        );
    }

    static async resetSpamCount(discordId: string, guildId: string): Promise<void> {
        await ActivityXP.updateOne({ discordId, guildId }, { spamCount: 0 });
    }
}
