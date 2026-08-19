import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Punishment, AuditLog } from "@database/models";
import { PunishmentRepository, PunishConfigRepository } from "@database/repositories";
import { GuildAccessGuard } from "../auth/guild-access.guard";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Moderation history, read-only.
 *
 * Deliberately so, for now. A ban issued from a web form has none of the things the slash command
 * gives it — no proof flow, no approval routing, no Discord-side hierarchy check against the actor's
 * own roles — and shipping a second, weaker path to the same action is how a moderation system ends
 * up with cases nobody can account for. Reading is the half that is safe to add first.
 */
@Controller("guilds/:guildId/moderation")
@UseGuards(GuildAccessGuard)
export class ModerationController {
    /** Recent cases across the guild, newest first. */
    @Get("cases")
    async cases(
        @Param("guildId") guildId: string,
        @Query("type") type?: string,
        @Query("userId") userId?: string,
        @Query("limit") limit?: string,
    ) {
        const filter: Record<string, unknown> = { guildId };
        if (type) filter.type = type;
        if (userId) filter.userId = userId;

        const cases = await Punishment.find(filter)
            .sort({ createdAt: -1 })
            .limit(pageSize(limit))
            .lean();

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

    /** One member's full record, which is what a moderator actually opens the dashboard for. */
    @Get("members/:userId")
    async member(@Param("guildId") guildId: string, @Param("userId") userId: string) {
        const [cases, active] = await Promise.all([
            PunishmentRepository.findByUser(userId, guildId),
            PunishmentRepository.findActiveByUser(userId, guildId),
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

    /** The punishment system's own settings, so the escalation ladder is visible beside the cases. */
    @Get("config")
    async config(@Param("guildId") guildId: string) {
        const config = await PunishConfigRepository.getCached(guildId);
        return {
            shortcutRoleIds: config.shortcutRoleIds,
            pointsPerAction: config.pointsPerAction,
            proofChannelId: config.proofChannelId ?? null,
        };
    }

    /** The security audit trail — kicks, bans and role grants the bot observed. */
    @Get("audit")
    async audit(@Param("guildId") guildId: string, @Query("limit") limit?: string) {
        const entries = await AuditLog.find({ guildId })
            .sort({ createdAt: -1 })
            .limit(pageSize(limit))
            .lean();

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

function pageSize(raw: string | undefined): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return PAGE_SIZE;
    return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}
