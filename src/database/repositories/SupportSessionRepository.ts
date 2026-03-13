import { SupportSession, type ISupportSession } from "@database/models/SupportSession";

export class SupportSessionRepository {
    static async create(data: {
        guildId: string;
        channelId: string;
        userMessageId: string;
        userId: string;
    }): Promise<ISupportSession> {
        return SupportSession.create(data);
    }

    static async claim(userMessageId: string, staffId: string): Promise<ISupportSession | null> {
        return SupportSession.findOneAndUpdate(
            { userMessageId, claimedBy: null },
            { claimedBy: staffId, claimedAt: new Date() },
            { returnDocument: "after" }
        );
    }

    static async respond(userMessageId: string): Promise<ISupportSession | null> {
        const session = await SupportSession.findOne({ userMessageId });
        if (!session || !session.claimedAt) return null;

        const responseTimeMs = Date.now() - session.claimedAt.getTime();
        return SupportSession.findOneAndUpdate(
            { userMessageId },
            { respondedAt: new Date(), responseTimeMs },
            { returnDocument: "after" }
        );
    }

    static async resolve(userMessageId: string, points: number): Promise<ISupportSession | null> {
        return SupportSession.findOneAndUpdate(
            { userMessageId },
            { resolved: true, pointsAwarded: points },
            { returnDocument: "after" }
        );
    }

    static async findOpen(channelId: string): Promise<ISupportSession[]> {
        return SupportSession.find({ channelId, resolved: false }).sort({ createdAt: -1 });
    }

    static async findOpenByUser(channelId: string, userId: string): Promise<ISupportSession | null> {
        return SupportSession.findOne({ channelId, userId, resolved: false }).sort({ createdAt: -1 });
    }

    static async claimByChannel(channelId: string, staffId: string): Promise<ISupportSession | null> {
        return SupportSession.findOneAndUpdate(
            { channelId, claimedBy: null, resolved: false },
            { claimedBy: staffId, claimedAt: new Date() },
            { returnDocument: "after", sort: { createdAt: -1 } }
        );
    }

    static async reassign(userMessageId: string, newStaffId: string): Promise<ISupportSession | null> {
        return SupportSession.findOneAndUpdate(
            { userMessageId, resolved: false },
            { claimedBy: newStaffId, claimedAt: new Date(), respondedAt: null, responseTimeMs: null },
            { returnDocument: "after" },
        );
    }

    static async findStale(maxAgeMs: number): Promise<ISupportSession[]> {
        const cutoff = new Date(Date.now() - maxAgeMs);
        return SupportSession.find({
            resolved: false,
            updatedAt: { $lt: cutoff },
        });
    }

    static async findByStaff(staffId: string, limit = 50): Promise<ISupportSession[]> {
        return SupportSession.find({ claimedBy: staffId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async findByMessage(userMessageId: string): Promise<ISupportSession | null> {
        return SupportSession.findOne({ userMessageId });
    }

    static async touchSession(userMessageId: string): Promise<void> {
        await SupportSession.updateOne({ userMessageId }, { updatedAt: new Date() });
    }

    static async addStaffMessage(userMessageId: string, content: string): Promise<void> {
        await SupportSession.updateOne(
            { userMessageId },
            { $push: { staffMessages: content.slice(0, 200) } },
        );
    }

    static async setSessionQuality(
        userMessageId: string,
        quality: "professional" | "normal" | "bad",
    ): Promise<void> {
        await SupportSession.updateOne({ userMessageId }, { sessionQuality: quality });
    }

    static async setUserSentiment(
        userMessageId: string,
        sentiment: "positive" | "negative" | "neutral",
    ): Promise<void> {
        await SupportSession.updateOne({ userMessageId }, { userSentiment: sentiment });
    }

    static async getAverageResponseTime(staffId: string): Promise<number> {
        const result = await SupportSession.aggregate([
            { $match: { claimedBy: staffId, responseTimeMs: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: "$responseTimeMs" } } },
        ]);
        return result[0]?.avg ?? 0;
    }

    static async getStaffStats(staffId: string): Promise<{
        totalClaimed: number;
        totalResolved: number;
        avgResponseMs: number;
        totalPoints: number;
    }> {
        const [countResult, avgResult, pointsResult] = await Promise.all([
            SupportSession.aggregate([
                { $match: { claimedBy: staffId } },
                {
                    $group: {
                        _id: null,
                        totalClaimed: { $sum: 1 },
                        totalResolved: {
                            $sum: { $cond: ["$resolved", 1, 0] },
                        },
                    },
                },
            ]),
            SupportSession.aggregate([
                { $match: { claimedBy: staffId, responseTimeMs: { $ne: null } } },
                { $group: { _id: null, avg: { $avg: "$responseTimeMs" } } },
            ]),
            SupportSession.aggregate([
                { $match: { claimedBy: staffId, resolved: true } },
                { $group: { _id: null, total: { $sum: "$pointsAwarded" } } },
            ]),
        ]);

        return {
            totalClaimed: countResult[0]?.totalClaimed ?? 0,
            totalResolved: countResult[0]?.totalResolved ?? 0,
            avgResponseMs: avgResult[0]?.avg ?? 0,
            totalPoints: pointsResult[0]?.total ?? 0,
        };
    }
}
