import { Injectable } from "@nestjs/common";
import { resolveLimit } from "../../common";
import type {
    AuditEntryResponse,
    ListCasesQueryDto,
    MemberRecordResponse,
    ModerationCaseResponse,
    PunishConfigResponse,
} from "../dto";
import { ModerationRepository } from "../repositories";

/**
 * Moderation history, read-only.
 *
 * Deliberately so, for now. A ban issued from a web form has none of the things the slash command
 * gives it — no proof flow, no approval routing, no Discord-side hierarchy check against the actor's
 * own roles — and shipping a second, weaker path to the same action is how a moderation system ends
 * up with cases nobody can account for. Reading is the half that is safe to add first.
 *
 * `apps/dashboard-api/test/route-check.ts` asserts no non-GET route exists under `/moderation`, so
 * the decision is enforced rather than remembered.
 */
@Injectable()
export class ModerationService {
    constructor(private readonly repository: ModerationRepository) {}

    async listCases(guildId: string, query: ListCasesQueryDto): Promise<ModerationCaseResponse[]> {
        const cases = await this.repository.findCases(
            { guildId, type: query.type, userId: query.userId },
            resolveLimit(query.limit),
        );

        return cases.map(entry => ({
            caseId: entry.caseId,
            type: entry.type,
            userId: entry.userId,
            moderatorId: entry.moderatorId,
            reason: entry.reason,
            active: entry.active,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt ?? null,
        }));
    }

    async memberRecord(guildId: string, userId: string): Promise<MemberRecordResponse> {
        const [cases, active] = await Promise.all([
            this.repository.findCasesByUser(userId, guildId),
            this.repository.findActiveCasesByUser(userId, guildId),
        ]);

        return {
            userId,
            total: cases.length,
            activeCount: active.length,
            cases: cases.map(entry => ({
                caseId: entry.caseId,
                type: entry.type,
                reason: entry.reason,
                moderatorId: entry.moderatorId,
                active: entry.active,
                createdAt: entry.createdAt,
                expiresAt: entry.expiresAt ?? null,
            })),
        };
    }

    async config(guildId: string): Promise<PunishConfigResponse> {
        const config = await this.repository.config(guildId);

        return {
            shortcutRoleIds: config.shortcutRoleIds,
            pointsPerAction: config.pointsPerAction,
            proofChannelId: config.proofChannelId ?? null,
        };
    }

    async listAudit(guildId: string, limit: string | undefined): Promise<AuditEntryResponse[]> {
        const entries = await this.repository.findAuditEntries(guildId, resolveLimit(limit));

        return entries.map(entry => ({
            eventName: entry.eventName,
            source: entry.source,
            actorId: entry.actorId ?? null,
            targetId: entry.targetId ?? null,
            channelId: entry.channelId ?? null,
            metadata: entry.metadata ?? null,
            createdAt: entry.createdAt,
        }));
    }
}
