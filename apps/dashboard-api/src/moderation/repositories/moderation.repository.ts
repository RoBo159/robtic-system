import { Injectable } from "@nestjs/common";
import { AuditLog, Punishment, type IAuditLog, type IPunishment } from "@database/models";
import { PunishConfigRepository, PunishmentRepository } from "@database/repositories";
import type { IPunishConfig } from "@database/models";
import type { CaseFilter } from "../interfaces";

/**
 * Every moderation query, in one injectable.
 *
 * The controller used to call `Punishment.find(...)` and `AuditLog.find(...)` on the mongoose models
 * directly — building filter objects, sorting and applying `.limit()` inside an HTTP handler. That
 * put query construction two layers above where it belongs and made the controller impossible to
 * exercise without a live database.
 *
 * `.lean()` on both list queries is deliberate and not an optimisation detail: these results are
 * projected straight into a response, and hydrated mongoose documents would carry the whole model
 * prototype into a `JSON.stringify` that only wants six fields.
 */
@Injectable()
export class ModerationRepository {
    /** Recent cases across the guild, newest first. */
    findCases(filter: CaseFilter, limit: number): Promise<IPunishment[]> {
        const query: Record<string, unknown> = { guildId: filter.guildId };
        if (filter.type) query.type = filter.type;
        if (filter.userId) query.userId = filter.userId;

        return Punishment.find(query).sort({ createdAt: -1 }).limit(limit).lean<IPunishment[]>().exec();
    }

    findCasesByUser(userId: string, guildId: string): Promise<IPunishment[]> {
        return PunishmentRepository.findByUser(userId, guildId);
    }

    findActiveCasesByUser(userId: string, guildId: string): Promise<IPunishment[]> {
        return PunishmentRepository.findActiveByUser(userId, guildId);
    }

    /** The punishment system's own settings — the escalation ladder behind the cases. */
    config(guildId: string): Promise<IPunishConfig> {
        return PunishConfigRepository.getCached(guildId);
    }

    /** The security audit trail — kicks, bans and role grants the bot observed. */
    findAuditEntries(guildId: string, limit: number): Promise<IAuditLog[]> {
        return AuditLog.find({ guildId }).sort({ createdAt: -1 }).limit(limit).lean<IAuditLog[]>().exec();
    }
}
