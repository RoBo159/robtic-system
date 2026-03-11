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
            { returnDocument: "after" }
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
            { returnDocument: "after" }
        );
    }

    static async close(threadId: string, closedBy: string): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId },
            { status: "closed", closedBy, closedAt: new Date() },
            { returnDocument: "after" }
        );
    }

    static async findAllOpen(guildId: string): Promise<IModMailThread[]> {
        return ModMailThread.find({ guildId, status: "open" }).sort({ createdAt: -1 });
    }

    static async setPaused(threadId: string, paused: boolean): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId },
            { paused },
            { returnDocument: "after" }
        );
    }

    static async transfer(threadId: string, newStaffId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId },
            { claimedBy: newStaffId },
            { returnDocument: "after" }
        );
    }

    static async reopen(threadId: string): Promise<IModMailThread | null> {
        return ModMailThread.findOneAndUpdate(
            { threadId, status: "closed" },
            { status: "open", closedBy: null, closedAt: null, paused: false },
            { returnDocument: "after" }
        );
    }

    static async findAllClosed(guildId: string): Promise<IModMailThread[]> {
        return ModMailThread.find({ guildId, status: "closed" }).sort({ closedAt: -1 });
    }
}
