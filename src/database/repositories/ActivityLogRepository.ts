import { ActivityLog, type IActivityLog, type ActivityLogType } from "@database/models/ActivityLog";

export class ActivityLogRepository {
    static async log(data: {
        guildId: string;
        userId: string;
        type: ActivityLogType;
        amount: number;
        details?: string;
    }): Promise<IActivityLog> {
        return ActivityLog.create(data);
    }

    static async getByUser(userId: string, guildId: string, limit = 50): Promise<IActivityLog[]> {
        return ActivityLog.find({ userId, guildId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async getByType(guildId: string, type: ActivityLogType, limit = 50): Promise<IActivityLog[]> {
        return ActivityLog.find({ guildId, type })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async getUserTypeCount(userId: string, guildId: string, type: ActivityLogType, since?: Date): Promise<number> {
        const query: Record<string, unknown> = { userId, guildId, type };
        if (since) query.createdAt = { $gte: since };
        return ActivityLog.countDocuments(query);
    }

    static async getUserPointsSum(userId: string, guildId: string, type: ActivityLogType, since?: Date): Promise<number> {
        const match: Record<string, unknown> = { userId, guildId, type };
        if (since) match.createdAt = { $gte: since };

        const result = await ActivityLog.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        return result[0]?.total ?? 0;
    }
}
