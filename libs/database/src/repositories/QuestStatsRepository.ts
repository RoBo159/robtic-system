import { QuestStats, type IQuestStats } from "@database/models/QuestStats";
import type { QuestTier } from "@constants";

const TIER_FIELD: Record<QuestTier, keyof IQuestStats & string> = {
    easy: "easyCompleted",
    normal: "normalCompleted",
    hard: "hardCompleted",
    golden: "goldenCompleted",
    vip: "vipCompleted",
    special: "specialCompleted",
};

export class QuestStatsRepository {
    static async get(guildId: string, discordId: string): Promise<IQuestStats | null> {
        return QuestStats.findOne({ guildId, discordId });
    }

    static async recordClaim(guildId: string, discordId: string, username: string): Promise<void> {
        await QuestStats.updateOne(
            { guildId, discordId },
            { $inc: { claimed: 1 }, $set: { username } },
            { upsert: true }
        );
    }

    /**
     * Records a completion.
     *
     * `fastestCompletionMs` uses `$min`, which treats a missing field as "no existing value" and
     * takes the new one — so the first completion seeds it without a separate branch.
     */
    static async recordCompletion(input: {
        guildId: string;
        discordId: string;
        username: string;
        tier: QuestTier;
        durationMs: number;
        reward: number;
        firstPlace: boolean;
    }): Promise<void> {
        await QuestStats.updateOne(
            { guildId: input.guildId, discordId: input.discordId },
            {
                $inc: {
                    completed: 1,
                    [TIER_FIELD[input.tier]]: 1,
                    pointsEarned: input.reward,
                    totalCompletionMs: input.durationMs,
                    ...(input.firstPlace ? { firstPlaceFinishes: 1 } : {}),
                },
                $min: { fastestCompletionMs: input.durationMs },
                $set: { username: input.username, lastCompletedAt: new Date() },
            },
            { upsert: true }
        );
    }

    static async recordFailure(guildId: string, discordId: string): Promise<void> {
        await QuestStats.updateOne({ guildId, discordId }, { $inc: { failed: 1 } }, { upsert: true });
    }

    static async recordCommunityCompletion(
        guildId: string,
        discordId: string,
        username: string,
        reward: number,
    ): Promise<void> {
        await QuestStats.updateOne(
            { guildId, discordId },
            {
                $inc: { communityCompleted: 1, pointsEarned: reward },
                $set: { username, lastCompletedAt: new Date() },
            },
            { upsert: true }
        );
    }

    static async getTop(guildId: string, limit = 10): Promise<IQuestStats[]> {
        return QuestStats.find({ guildId, completed: { $gt: 0 } }).sort({ completed: -1 }).limit(limit);
    }

    static async getRank(guildId: string, discordId: string): Promise<number> {
        const record = await QuestStats.findOne({ guildId, discordId });
        if (!record || record.completed <= 0) return 0;

        const above = await QuestStats.countDocuments({ guildId, completed: { $gt: record.completed } });
        return above + 1;
    }
}
