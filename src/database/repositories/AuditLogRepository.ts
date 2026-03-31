import { AuditLog, type IAuditLog } from "@database/models/AuditLog";

export class AuditLogRepository {
    static async log(data: {
        guildId?: string;
        eventName: string;
        source: string;
        actorId?: string;
        targetId?: string;
        channelId?: string;
        messageId?: string;
        botName?: BotName;
        metadata?: Record<string, unknown>;
    }): Promise<IAuditLog> {
        return AuditLog.create(data);
    }

    static async getRecentByGuild(guildId: string, limit = 100): Promise<IAuditLog[]> {
        return AuditLog.find({ guildId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async getRecentByEvent(eventName: string, guildId?: string, limit = 100): Promise<IAuditLog[]> {
        const query: Record<string, unknown> = { eventName };
        if (guildId) query.guildId = guildId;

        return AuditLog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async countSince(params: {
        eventName: string;
        guildId?: string;
        actorId?: string;
        since: Date;
    }): Promise<number> {
        const query: Record<string, unknown> = {
            eventName: params.eventName,
            createdAt: { $gte: params.since },
        };

        if (params.guildId) query.guildId = params.guildId;
        if (params.actorId) query.actorId = params.actorId;

        return AuditLog.countDocuments(query);
    }
}
