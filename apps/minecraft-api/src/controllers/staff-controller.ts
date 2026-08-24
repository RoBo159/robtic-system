import { API_ROUTES, API_SCOPES, STAFF_ACTION_STAT, formatDuration, schema, v, validateBody } from "@sdk";
import { MinecraftModerationRepository, StaffLogRepository, StaffStatsRepository } from "@database/repositories";
import { ok } from "../lib/respond";
import { intQueryParam, optionalQueryParam, queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { StaffService } from "../services/staff-service";
import { StaffRankService } from "../services/staff-rank-service";
import { ReportService } from "../services/report-service";
import { MailService } from "../services/mail-service";
import { StaffRosterService } from "../services/staff-roster-service";
import { publishBridgeEvent } from "@core/minecraft";
import { ModerationService } from "../services/moderation-service";
import { AnalyticsService } from "../services/analytics-service";
import { DiscordLogService } from "../services/discord-log-service";
import type { Route } from "../router";

const MAX_PAGE = 100;

/** Roster action to the audit action it is logged as. */
function auditActionFor(action: "add" | "promote" | "demote" | "set-role" | "fire") {
    return ({
        add: "staff_added",
        promote: "staff_promoted",
        demote: "staff_demoted",
        "set-role": "staff_role_changed",
        fire: "staff_fired",
    } as const)[action];
}

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

/**
 * A position on a report.
 *
 * Optional throughout: a report filed from a console command or by a player whose world has just
 * been unloaded has no coordinates to give, and refusing the report over a missing block position
 * would lose the thing staff actually need — the reason.
 */
const reportLocation = v.optional(
    v.object({
        world: v.string({ min: 1, max: 64 }),
        x: v.number(),
        y: v.number(),
        z: v.number(),
    }),
);

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
                rank: v.optional(
                    v.object({
                        // Optional: a rank is a LuckPerms group, and roles.yml explicitly allows a
                        // rung with no Discord role to mirror onto. Requiring a snowflake here
                        // rejected those ranks outright with a validation error.
                        roleId: v.optional(schema.snowflake()),
                        name: v.string({ min: 1, max: 32 }),
                        group: v.string({ min: 1, max: 48 }),
                        priority: v.number({ integer: true }),
                    }),
                ),
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
                    claimed: body.rank,
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
        path: API_ROUTES.staff.rank,
        scope: API_SCOPES.staff,
        summary: "Promote or demote a linked player along the guild's staff ladder",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                targetUuid: schema.uuid(),
                direction: v.oneOf(["promote", "demote"] as const),
                grantRoleId: v.optional(schema.snowflake()),
                revokeRoleId: v.optional(schema.snowflake()),
                fromRank: v.optional(v.string({ max: 32 })),
                toRank: v.optional(v.string({ max: 32 })),
                moderatorUuid: v.optional(schema.uuid()),
                moderatorUsername: v.optional(schema.username()),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "staff.rank", async () => {
                const changed = await StaffRankService.apply({
                    guildId,
                    uuid: body.targetUuid,
                    direction: body.direction,
                    grantRoleId: body.grantRoleId ?? null,
                    revokeRoleId: body.revokeRoleId ?? null,
                    from: body.fromRank ?? null,
                    to: body.toRank ?? null,
                });

                await publishBridgeEvent({
                    guildId,
                    type: "role_sync",
                    serverKey: null,
                    payload: {
                        discordId: changed.discordId,
                        minecraftUuid: body.targetUuid,
                        reason: body.direction,
                        grant: [],
                        revoke: [],
                    },
                });

                await DiscordLogService.publish({
                    guildId,
                    serverId,
                    serverName: context.serverName ?? serverId,
                    action: "role_sync",
                    moderatorUuid: body.moderatorUuid,
                    moderatorUsername: body.moderatorUsername,
                    targetUuid: body.targetUuid,
                    targetUsername: changed.username,
                    // Absent when the player has not linked Discord, which no longer blocks a rank
                    // change — the embed simply names the Minecraft account and nothing else.
                    targetDiscordId: changed.discordId ?? undefined,
                    reason: `${body.direction}: ${changed.from ?? "none"} → ${changed.to ?? "none"}`,
                    occurredAt: new Date().toISOString(),
                    requestId: body.requestId,
                });

                return changed;
            });

            return ok({ ...result, duplicate });
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

            // Warnings are routinely issued while the player is offline, and a chat line sent to
            // somebody who is not connected is simply lost — so a warning nobody could read is a
            // warning that never happened. The mailbox is what makes it reach them.
            await MailService.sendAll([
                {
                    guildId,
                    recipientUuid: body.targetUuid,
                    recipientUsername: body.targetUsername,
                    category: "warned",
                    subject: "You have been warned",
                    body: [
                        `A warning was issued by ${body.authorUsername}.`,
                        "",
                        `Reason: ${body.text}`,
                        "",
                        "Repeated warnings lead to a jail or a ban.",
                    ],
                    important: true,
                    referenceId: result.id,
                    serverId,
                },
            ]);

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
        method: "POST",
        path: API_ROUTES.staff.claimReport,
        scope: API_SCOPES.staff,
        summary: "Claim an open report - atomic, so only the first staff member succeeds",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                reportId: v.string({ min: 1, max: 64 }),
                staffUuid: schema.uuid(),
                staffUsername: schema.username(),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Deliberately NOT wrapped in withIdempotency. A replayed claim must be allowed to fail
            // with CONFLICT: replaying a cached success would tell a second staff member they won a
            // race they actually lost, which is the one outcome the atomic claim exists to prevent.
            const claimed = await ReportService.claim({
                guildId,
                reportId: body.reportId,
                staffUuid: body.staffUuid,
                staffUsername: body.staffUsername,
            });

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                // Claiming is not accepting. It says a staff member has picked the report up and is
                // handling it; whether it is upheld is decided later, by /api/staff/reports/decide.
                action: "report_claimed",
                moderatorUuid: body.staffUuid,
                moderatorUsername: body.staffUsername,
                targetUuid: claimed.targetUuid,
                targetUsername: claimed.targetUsername,
                reason: claimed.reason,
                fields: { Report: `#${claimed.code}`, Reporter: claimed.reporterUsername },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            return ok(claimed);
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.closeReport,
        scope: API_SCOPES.staff,
        summary: "Close a report as resolved or dismissed",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                reportId: v.string({ min: 1, max: 64 }),
                staffUuid: schema.uuid(),
                staffUsername: schema.username(),
                status: v.oneOf(["resolved", "dismissed"] as const),
                note: v.optional(schema.reason()),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.closeReport", async () =>
                ReportService.close({
                    guildId,
                    reportId: body.reportId,
                    staffUuid: body.staffUuid,
                    staffUsername: body.staffUsername,
                    status: body.status,
                    note: body.note,
                }),
            );

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: body.status === "resolved" ? "report_closed" : "report_dismissed",
                moderatorUuid: body.staffUuid,
                moderatorUsername: body.staffUsername,
                targetUuid: result.targetUuid,
                targetUsername: result.targetUsername,
                reason: body.note ?? result.reason,
                fields: { Report: `#${result.code}`, Reporter: result.reporterUsername },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            return ok(result);
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.reportCounts,
        scope: API_SCOPES.staff,
        summary: "Report counts by status, for the staff placeholders",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await ReportService.counts(guildId, optionalQueryParam(context, "staffUuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.manageStaff,
        scope: API_SCOPES.staff,
        summary: "Record a staff roster change and mirror it onto Discord",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                action: v.oneOf(["add", "promote", "demote", "set-role", "fire"] as const),
                actorUuid: schema.uuid(),
                actorUsername: schema.username(),
                targetUuid: schema.uuid(),
                targetUsername: schema.username(),
                fromRank: v.nullable(v.string({ max: 32 })),
                toRank: v.nullable(v.string({ max: 32 })),
                grantRoleId: v.optional(schema.snowflake()),
                revokeRoleIds: v.optional(v.arrayOf(schema.snowflake(), { max: 32 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.manage", async () =>
                StaffRosterService.apply({
                    guildId,
                    action: body.action,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    fromRank: body.fromRank,
                    toRank: body.toRank,
                    grantRoleId: body.grantRoleId,
                    revokeRoleIds: body.revokeRoleIds,
                }),
            );

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: auditActionFor(body.action),
                moderatorUuid: body.actorUuid,
                moderatorUsername: body.actorUsername,
                targetUuid: body.targetUuid,
                targetUsername: body.targetUsername,
                targetDiscordId: result.discordId ?? undefined,
                fields: { From: result.fromRank ?? "none", To: result.toRank ?? "none" },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            return ok(result);
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
            const status = optionalQueryParam(context, "status") as "open" | "reviewing" | "resolved" | "dismissed" | undefined;
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
        summary: "File a player report, capturing both positions and a unique six-digit code",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                ...entryBody,
                reporterLocation: reportLocation,
                targetLocation: reportLocation,
                targetOnline: v.optional(v.boolean()),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            const { result } = await withIdempotency(body.requestId, guildId, "staff.reports", async () =>
                ModerationService.addReport({
                    guildId,
                    serverId,
                    reporterUuid: body.authorUuid,
                    reporterUsername: body.authorUsername,
                    reporterLocation: body.reporterLocation,
                    targetUuid: body.targetUuid,
                    targetUsername: body.targetUsername,
                    targetLocation: body.targetLocation,
                    targetOnline: body.targetOnline,
                    reason: body.text,
                }),
            );

            // Everything a staff member needs to act without opening the game: the code they will
            // type, both positions, and whichever Discord accounts are linked. The channel this
            // lands in is the guild's `player_report` log target — see DiscordLogService.
            await recordEntryAction(guildId, serverId, body, "player_report", {
                Report: `#${result.code}`,
                "Reported player": describePlayer(result.targetUsername, result.targetDiscordId),
                "Reported at": describeLocation(result.targetLocation, result.targetOnline),
                Reporter: describePlayer(result.reporterUsername, result.reporterDiscordId),
                "Reporter at": describeLocation(result.reporterLocation, true),
                Accept: `/report accept ${result.code}`,
            });

            return ok(result);
        },
    },
    {
        method: "GET",
        path: API_ROUTES.staff.reportByCode,
        scope: API_SCOPES.staff,
        summary: "Resolve a six-digit report code to the full report",
        tag: "Staff",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await ReportService.byCode(guildId, queryParam(context, "code")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.staff.decideReport,
        scope: API_SCOPES.staff,
        summary: "Accept a report - jailing the reported player and mailing both sides - or refuse it",
        tag: "Staff",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                reportId: v.string({ min: 1, max: 64 }),
                decision: v.oneOf(["accept", "refuse"] as const),
                staffUuid: schema.uuid(),
                staffUsername: schema.username(),
                // Nullable rather than optional: an explicit null is "permanent", which is a value
                // the staff member chose, not the same thing as the field being absent.
                jailDurationMs: v.nullable(v.number({ min: 1000, integer: true })),
                note: v.optional(schema.reason()),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Deliberately NOT wrapped in withIdempotency, for the same reason the claim is not: a
            // replayed decision must be allowed to fail with CONFLICT. Replaying a cached success
            // would tell a second staff member they settled a report somebody else had already
            // settled — and, worse, report a jail that this call did not open.
            const outcome = await ReportService.decide({
                guildId,
                serverId,
                reportId: body.reportId,
                decision: body.decision,
                staffUuid: body.staffUuid,
                staffUsername: body.staffUsername,
                jailDurationMs: body.jailDurationMs,
                note: body.note,
            });

            await DiscordLogService.publish({
                guildId,
                serverId,
                serverName: body.serverName,
                action: body.decision === "accept" ? "report_accepted" : "report_refused",
                moderatorUuid: body.staffUuid,
                moderatorUsername: body.staffUsername,
                targetUuid: outcome.report.targetUuid,
                targetUsername: outcome.report.targetUsername,
                targetDiscordId: outcome.report.targetDiscordId ?? undefined,
                reason: body.note ?? outcome.report.reason,
                fields: {
                    Report: `#${outcome.report.code}`,
                    Reporter: outcome.report.reporterUsername,
                    Jailed: outcome.jailed
                        ? formatDuration(body.jailDurationMs ?? null)
                        : outcome.jailSkippedReason ?? "no",
                },
                occurredAt: new Date().toISOString(),
                requestId: body.requestId,
            });

            const counter = STAFF_ACTION_STAT[body.decision === "accept" ? "report_accepted" : "report_refused"];
            if (counter) {
                await StaffStatsRepository.increment(
                    guildId,
                    { uuid: body.staffUuid, username: body.staffUsername },
                    counter,
                );
            }

            return ok(outcome);
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
    fields?: Record<string, string>,
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
        fields,
        occurredAt: new Date().toISOString(),
        requestId: body.requestId,
    });
}

/** "Steve · <@123>" when linked, just the name when not. Discord being unconfigured is not an error. */
function describePlayer(username: string, discordId: string | null): string {
    return discordId ? `${username} · <@${discordId}>` : `${username} (not linked)`;
}

/**
 * A position, rendered for the embed.
 *
 * Block coordinates rather than the raw doubles: nobody needs a player's position to seventeen
 * decimal places, and the rounded form is what a staff member will type into `/tp`.
 */
function describeLocation(
    location: { world: string; x: number; y: number; z: number } | null,
    online: boolean,
): string {
    if (!location) return online ? "unknown" : "offline, no last position recorded";

    const position = `${location.world} ${Math.round(location.x)}, ${Math.round(location.y)}, ${Math.round(location.z)}`;
    return online ? position : `${position} (offline)`;
}
