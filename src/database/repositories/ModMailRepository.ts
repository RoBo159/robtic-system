import { ModMailThread, type IModMailThread } from "@database/models/ModMailThread";

export class ModMailRepository {
    static async create(data: Partial<IModMailThread>): Promise<IModMailThread> {
        return ModMailThread.create(data);
    }

    static async findByThreadId(threadId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOne({ threadId });
    }

    static async findOpenByUser(userId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOne({ userId, status: "open" });
    }

    static async findByStaffChannel(staffChannelId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOne({ staffChannelId, status: "open" });
    }

    static async claim(threadId: string, staffId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId, claimedBy: null },
            { claimedBy: staffId },
            { new: true }
        );
    }

    static async addMessage(
        threadId: string,
        authorId: string,
        authorType: "user" | "staff",
        content: string,
        attachments: string[] = []
    ): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId },
            {
                $push: {
                    messages: { authorId, authorType, content, attachments, timestamp: new Date() },
                },
            },
            { new: true }
        );
    }

    static async close(threadId: string, closedBy: string): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId },
            { status: "closed", closedBy, closedAt: new Date() },
            { new: true }
        );
    }

    static async findAllOpen(guildId: string): Promise<IModMailThread[]> {
        return ModMailThread.find({ guildId, status: "open" }).sort({ createdAt: -1 });
    }
}
