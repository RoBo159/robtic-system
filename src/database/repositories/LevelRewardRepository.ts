import { LevelReward, type ILevelReward } from "@database/models/LevelReward";

export class LevelRewardRepository {
    static async set(guildId: string, level: number, roleId: string): Promise<ILevelReward> {
        return LevelReward.findOneAndUpdate(
            { guildId, level },
            { roleId },
            { upsert: true, returnDocument: "after" }
        );
    }

    static async remove(guildId: string, level: number): Promise<boolean> {
        const result = await LevelReward.deleteOne({ guildId, level });
        return result.deletedCount > 0;
    }

    static async getForLevel(guildId: string, level: number): Promise<ILevelReward | null> {
        return LevelReward.findOne({ guildId, level });
    }

    static async getAll(guildId: string): Promise<ILevelReward[]> {
        return LevelReward.find({ guildId }).sort({ level: 1 });
    }

    static async getUpToLevel(guildId: string, level: number): Promise<ILevelReward[]> {
        return LevelReward.find({ guildId, level: { $lte: level } }).sort({ level: 1 });
    }
}
