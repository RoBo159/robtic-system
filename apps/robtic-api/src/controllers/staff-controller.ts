import { API_ROUTES, API_SCOPES, STAFF_ACTION_STAT, formatDuration, schema, v, validateBody } from "@sdk";
import { MinecraftModerationRepository, StaffLogRepository, StaffStatsRepository } from "@database/repositories";
import { ok } from "../lib/respond";
import { intQueryParam, optionalQueryParam, queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { StaffService } from "../services/staff-service";
import { ModerationService } from "../services/moderation-service";
import { AnalyticsService } from "../services/analytics-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

const MAX_PAGE = 100;

/** The body every freeze, jail and unjail call shares. */
const moderationBody = {
    guildId: schema.snowflake(),
    targetUuid: schema.uuid(),
    moderatorUuid: schema.uuid(),
    moderatorUsername: schema.username(),
    requestId: schema.requestId(),
    ...schema.serverIdentity(),
};

/** The body the note, warning and report writes share. */
const entryBody = {
    guildId: schema.snowflake(),
    targetUuid: schema.uuid(),
    targetUsername: schema.username(),
    authorUuid: schema.uuid(),
    authorUsername: schema.username(),
    text: schema.reason(1024),
    requestId: schema.requestId(),
    ...schema.serverIdentity(),
};

export const staffRoutes: Route[] = [
    {
        method: "POST",
        path: API_ROUTES.staff.enable,
        scope: API_SCOPES.staff,
        summary: "Open a staff-mode session and durably store the player's inventory snapshot",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                snapshot: schema.inventorySnapshot(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.enable", async () =>
                StaffService.enable({
                    guildId,
                    uuid: body.uuid,
                    username: body.username,
                    serverId,
                    snapshot: body.snapshot,
                }),
            );

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: "staff_enabled",
                moderatorUuid: body.uuid,
                moderatorUsername: body.username,
                fields: { Rank: String(result.rankName) },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.disable,
        scope: API_SCOPES.staff,
        summary: "Close a staff-mode session and return the snapshot for restoration",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                reason: v.oneOf(["command", "disconnect", "shutdown", "recovery"] as const),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Deliberately not idempotency-wrapped: a replay must hand the snapshot back again,
            // because the first attempt may be exactly the one that failed to restore it.
            const result = await StaffService.disable({
                guildId,
                uuid: body.uuid,
                serverId,
                reason: body.reason,
            });

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: "staff_disabled",
                moderatorUuid: body.uuid,
                duration: formatDuration(result.durationMs),
                fields: { Ended: body.reason },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            return ok(result);
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.backup,
        scope: API_SCOPES.staff,
        summary: "Fetch an unrestored staff backup, used for crash recovery on join",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const serverId = requireServerId(context);
            return ok(await StaffService.pendingBackup(guildId, queryParam(context, "uuid"), serverId));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.confirmRestore,
        scope: API_SCOPES.staff,
        summary: "Confirm a staff snapshot was restored in game, releasing the stored backup",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // The backup is deleted only here, never in `disable`. If this call never arrives the
            // snapshot survives and the player's next join restores it again — a duplicate restore
            // is recoverable, a missing one is not.
            await StaffService.confirmRestore(guildId, body.uuid, serverId);

            return ok({ acknowledged: true as const, requestId: body.requestId });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.freeze,
        scope: API_SCOPES.staff,
        summary: "Freeze a player",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                ...moderationBody,
                targetUsername: schema.username(),
                reason: v.optional(schema.reason()),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.freeze", async () =>
                ModerationService.freeze({
                    guildId,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    serverId,
                    moderatorUuid: body.moderatorUuid,
                    moderatorUsername: body.moderatorUsername,
                    reason: body.reason,
                }),
            );

            await recordAction(guildId, serverId, body, "freeze", body.reason);
            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.unfreeze,
        scope: API_SCOPES.staff,
        summary: "Unfreeze a player",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, { ...moderationBody, targetUsername: v.optional(schema.username()) });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.unfreeze", async () =>
                ModerationService.unfreeze({
                    guildId,
                    targetUuid: body.targetUuid,
                    moderatorUuid: body.moderatorUuid,
                }),
            );

            await recordAction(guildId, serverId, body, "unfreeze");
            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.jail,
        scope: API_SCOPES.staff,
        summary: "Jail a player for a fixed or indefinite duration",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                ...moderationBody,
                targetUsername: schema.username(),
                durationMs: v.optional(v.number({ min: 1000, integer: true })),
                reason: schema.reason(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.jail", async () =>
                ModerationService.jail({
                    guildId,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    serverId,
                    moderatorUuid: body.moderatorUuid,
                    moderatorUsername: body.moderatorUsername,
                    durationMs: body.durationMs ?? null,
                    reason: body.reason,
                }),
            );

            await recordAction(guildId, serverId, body, "jail", body.reason, formatDuration(body.durationMs ?? null));
            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.unjail,
        scope: API_SCOPES.staff,
        summary: "Release a jailed player",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                ...moderationBody,
                reason: v.optional(schema.reason()),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.unjail", async () =>
                ModerationService.unjail({
                    guildId,
                    targetUuid: body.targetUuid,
                    moderatorUuid: body.moderatorUuid,
                    moderatorUsername: body.moderatorUsername,
                    reason: body.reason,
                }),
            );

            await recordAction(guildId, serverId, body, "release", body.reason);
            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.log,
        scope: API_SCOPES.staff,
        summary: "Append an audit entry and mirror it to Discord",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                action: schema.staffAction(),
                actorUuid: v.optional(schema.uuid()),
                actorUsername: v.optional(schema.username()),
                targetUuid: v.optional(schema.uuid()),
                targetUsername: v.optional(schema.username()),
                reason: v.optional(schema.reason()),
                duration: v.optional(v.string({ max: 64 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { duplicate } = await withIdempotency(body.requestId, guildId, "staff.log", async () => {
                await StaffLogRepository.append({
                    guildId,
                    action: body.action,
                    serverId,
                    actorUuid: body.actorUuid,
                    actorUsername: body.actorUsername,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    reason: body.reason,
                    duration: body.duration,
                });

                const counter = STAFF_ACTION_STAT[body.action];
                if (counter && body.actorUuid) {
                    await StaffStatsRepository.increment(
                        guildId,
                        { uuid: body.actorUuid, username: body.actorUsername ?? "unknown" },
                        counter,
                    );
                }

                return { acknowledged: true };
            });

            if (!duplicate) {
                await DiscordLogService.publish({
                    guildId,
                    serverId,
                    serverName: body.serverName,
                    action: body.action,
                    moderatorUuid: body.actorUuid,
                    moderatorUsername: body.actorUsername,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    reason: body.reason,
                    duration: body.duration,
                    occurredAt: new Date().toISOString(),
                    requestId: body.requestId,
                });
            }

            return ok({ acknowledged: true as const, requestId: body.requestId, duplicate });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.history,
        scope: API_SCOPES.staff,
        summary: "Page through a player's jail history",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const limit = intQueryParam(context, "limit", 10, MAX_PAGE);
            const offset = intQueryParam(context, "offset", 0, Number.MAX_SAFE_INTEGER);
            return ok(await ModerationService.jailHistory(guildId, queryParam(context, "uuid"), limit, offset));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.player,
        scope: API_SCOPES.staff,
        summary: "Everything the player-management GUI renders, in one document",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const uuid = queryParam(context, "uuid");

            const [freeze, jail, warnings, notes, reports, history] = await Promise.all([
                ModerationService.freezeState(guildId, uuid),
                ModerationService.jailState(guildId, uuid),
                MinecraftModerationRepository.listWarnings(guildId, uuid),
                MinecraftModerationRepository.listNotes(guildId, uuid),
                MinecraftModerationRepository.listReportsAgainst(guildId, uuid),
                ModerationService.jailHistory(guildId, uuid, 10, 0),
            ]);

            return ok({
                uuid,
                username: warnings[0]?.minecraftUsername ?? notes[0]?.minecraftUsername ?? "unknown",
                discordId: null,
                discordUsername: null,
                frozen: freeze.frozen,
                jail,
                warnings: warnings.map(warning => ({
                    id: String(warning._id),
                    reason: warning.reason,
                    issuedByUuid: warning.issuedByUuid,
                    issuedByUsername: warning.issuedByUsername,
                    createdAt: warning.createdAt.toISOString(),
                    serverId: warning.serverId,
                })),
                notes: notes.map(note => ({
                    id: String(note._id),
                    text: note.text,
                    authorUuid: note.authorUuid,
                    authorUsername: note.authorUsername,
                    createdAt: note.createdAt.toISOString(),
                    serverId: note.serverId,
                })),
                reports: reports.map(report => ModerationService.toReportDto(report)),
                jailHistory: history.items,
                playTimeMs: 0,
                firstSeenAt: null,
                lastSeenAt: null,
            });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.notes,
        scope: API_SCOPES.staff,
        summary: "List a player's staff notes",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const uuid = queryParam(context, "uuid");
            const rows = await MinecraftModerationRepository.listNotes(guildId, uuid);

            return ok({
                items: rows.map(note => ({
                    id: String(note._id),
                    text: note.text,
                    authorUuid: note.authorUuid,
                    authorUsername: note.authorUsername,
                    createdAt: note.createdAt.toISOString(),
                    serverId: note.serverId,
                })),
                total: rows.length,
                limit: rows.length,
                offset: 0,
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.notes,
        scope: API_SCOPES.staff,
        summary: "Add a private staff note about a player",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, entryBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.notes", async () =>
                ModerationService.addNote({ ...body, guildId, serverId }),
            );

            await recordEntryAction(guildId, serverId, body, "note_added");
            return ok(result);
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.warnings,
        scope: API_SCOPES.staff,
        summary: "List a player's active warnings",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const rows = await MinecraftModerationRepository.listWarnings(guildId, queryParam(context, "uuid"));

            return ok({
                items: rows.map(warning => ({
                    id: String(warning._id),
                    reason: warning.reason,
                    issuedByUuid: warning.issuedByUuid,
                    issuedByUsername: warning.issuedByUsername,
                    createdAt: warning.createdAt.toISOString(),
                    serverId: warning.serverId,
                })),
                total: rows.length,
                limit: rows.length,
                offset: 0,
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.warnings,
        scope: API_SCOPES.staff,
        summary: "Issue a warning",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, entryBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.warnings", async () =>
                ModerationService.addWarning({ ...body, guildId, serverId }),
            );

            await recordEntryAction(guildId, serverId, body, "warning_added");
            return ok(result);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.removeWarning,
        scope: API_SCOPES.staff,
        summary: "Remove a warning, keeping the removal itself on record",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                warningId: v.string({ min: 12, max: 48 }),
                actorUuid: schema.uuid(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            await MinecraftModerationRepository.removeWarning(guildId, body.warningId, body.actorUuid);

            return ok({ acknowledged: true as const, requestId: body.requestId });
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.reports,
        scope: API_SCOPES.staff,
        summary: "List player reports",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const status = optionalQueryParam(context, "status") as "open" | "resolved" | "dismissed" | undefined;
            const rows = await MinecraftModerationRepository.listReports(guildId, status);

            return ok({
                items: rows.map(report => ModerationService.toReportDto(report)),
                total: rows.length,
                limit: rows.length,
                offset: 0,
            });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.reports,
        scope: API_SCOPES.staff,
        summary: "File a player report",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, entryBody);
            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.reports", async () =>
                ModerationService.addReport({
                    guildId,
                    serverId,
                    reporterUuid: body.authorUuid,
                    reporterUsername: body.authorUsername,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    reason: body.text,
                }),
            );

            await recordEntryAction(guildId, serverId, body, "player_report");
            return ok(result);
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.dashboard,
        scope: API_SCOPES.staff,
        summary: "Live staff dashboard: on-duty staff, frozen and jailed players, open reports",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await AnalyticsService.dashboard(guildId, optionalQueryParam(context, "serverId")));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.stats,
        scope: API_SCOPES.staff,
        summary: "Analytics for one staff member",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await AnalyticsService.stats(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.leaderboard,
        scope: API_SCOPES.staff,
        summary: "Staff leaderboard by on-duty time",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            const limit = intQueryParam(context, "limit", 10, MAX_PAGE);
            const offset = intQueryParam(context, "offset", 0, Number.MAX_SAFE_INTEGER);
            return ok(await AnalyticsService.leaderboard(guildId, limit, offset));
        },
    },
];

/**
 * Writes the audit row and the Discord embed for a moderation action.
 *
 * Every moderation route ends the same way, so the sequence lives here rather than being repeated
 * six times — which is also what guarantees an action can never be applied without being logged.
 */
async function recordAction(
    guildId: string,
    serverId: string,
    body: {
        targetUuid: string;
        targetUsername?: string;
        moderatorUuid: string;
        moderatorUsername: string;
        serverName: string;
        requestId: string;
    },
    action: "freeze" | "unfreeze" | "jail" | "release",
    reason?: string,
    duration?: string,
): Promise<void> {
    await StaffLogRepository.append({
        guildId,
        action,
        serverId,
        actorUuid: body.moderatorUuid,
        actorUsername: body.moderatorUsername,
        targetUuid: body.targetUuid,
        targetUsername: body.targetUsername,
        reason,
        duration,
    });

    const counter = STAFF_ACTION_STAT[action];
    if (counter) {
        await StaffStatsRepository.increment(
            guildId,
            { uuid: body.moderatorUuid, username: body.moderatorUsername },
            counter,
        );
    }

    await DiscordLogService.publish({
        guildId,
        serverId,
        serverName: body.serverName,
        action,
        moderatorUuid: body.moderatorUuid,
        moderatorUsername: body.moderatorUsername,
        targetUuid: body.targetUuid,
        targetUsername: body.targetUsername,
        reason,
        duration,
        occurredAt: new Date().toISOString(),
        requestId: body.requestId,
    });
}

async function recordEntryAction(
    guildId: string,
    serverId: string,
    body: {
        targetUuid: string;
        targetUsername: string;
        authorUuid: string;
        authorUsername: string;
        text: string;
        serverName: string;
        requestId: string;
    },
    action: "note_added" | "warning_added" | "player_report",
): Promise<void> {
    await StaffLogRepository.append({
        guildId,
        action,
        serverId,
        actorUuid: body.authorUuid,
        actorUsername: body.authorUsername,
        targetUuid: body.targetUuid,
        targetUsername: body.targetUsername,
        reason: body.text,
    });

    const counter = STAFF_ACTION_STAT[action];
    if (counter) {
        await StaffStatsRepository.increment(
            guildId,
            { uuid: body.authorUuid, username: body.authorUsername },
            counter,
        );
    }

    await DiscordLogService.publish({
        guildId,
        serverId,
        serverName: body.serverName,
        action,
        moderatorUuid: body.authorUuid,
        moderatorUsername: body.authorUsername,
        targetUuid: body.targetUuid,
        targetUsername: body.targetUsername,
        reason: body.text,
        occurredAt: new Date().toISOString(),
        requestId: body.requestId,
    });
}
