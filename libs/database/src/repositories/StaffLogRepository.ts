import { StaffLog, type IStaffLog } from "@database/models/StaffLog";
import type { StaffAction } from "@sdk";

export interface StaffLogInput {
    guildId: string;
    action: StaffAction;
    serverId: string;
    actorUuid?: string;
    actorUsername?: string;
    actorDiscordId?: string;
    targetUuid?: string;
    targetUsername?: string;
    targetDiscordId?: string;
    reason?: string;
    duration?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
}

export class StaffLogRepository {
    static async append(input: StaffLogInput): Promise<IStaffLog> {
        return StaffLog.create({
            ...input,
            metadata: input.metadata ?? {},
            occurredAt: input.occurredAt ?? new Date(),
        });
    }

    static async listByTarget(guildId: string, targetUuid: string, limit: number, offset: number): Promise<IStaffLog[]> {
        return StaffLog.find({ guildId, targetUuid: targetUuid.toLowerCase() })
            .sort({ occurredAt: -1 })
            .skip(offset)
            .limit(limit);
    }

    static async listByActor(guildId: string, actorUuid: string, limit: number, offset: number): Promise<IStaffLog[]> {
        return StaffLog.find({ guildId, actorUuid: actorUuid.toLowerCase() })
            .sort({ occurredAt: -1 })
            .skip(offset)
            .limit(limit);
    }

    static async countByTarget(guildId: string, targetUuid: string): Promise<number> {
        return StaffLog.countDocuments({ guildId, targetUuid: targetUuid.toLowerCase() });
    }
}
