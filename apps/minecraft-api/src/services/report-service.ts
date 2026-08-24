import {
    API_ERROR_CODES,
    ApiError,
    formatDuration,
    normaliseUuid,
    type DecideReportResponse,
    type ReportDto,
} from "@sdk";
import { MinecraftModerationRepository } from "@database/repositories";
import type { MailInput } from "@database/repositories";
import { ModerationService } from "./moderation-service";
import { MailService } from "./mail-service";

/**
 * Claiming, deciding and closing reports.
 *
 * <h2>The API is the authority on ownership</h2>
 *
 * Every staff member in staff mode sees the same [Accept] button, so several will click it at once.
 * The plugin cannot settle that — its memory is per server, and two servers would both believe they
 * won. So the claim is a single atomic document update here, and the plugin does nothing but report
 * what this returned.
 *
 * <h2>And on punishment, for the same reason it is on ownership</h2>
 *
 * Accepting a report jails the reported player, who is very often offline — that is the whole point
 * of letting somebody be reported by name rather than by pointing at them. A game server can only
 * jail a connected `Player`, so a jail applied there would silently do nothing for exactly the
 * players it most needs to reach. Written here it becomes a sentence the network holds, re-read and
 * enforced by whichever server they next join.
 *
 * Separate from {@link ModerationService}, which owns *filing* reports along with freezes, jails and
 * warnings. This owns the lifecycle a filed report moves through.
 */
export class ReportService {
    /**
     * Resolves the six-digit code staff actually type.
     *
     * Every staff-facing path goes through this, because the code is the only identifier a human
     * ever sees. An id also resolves, so the GUI — which already holds one — needs no extra lookup.
     */
    static async byCode(guildId: string, code: string): Promise<ReportDto> {
        const found = await MinecraftModerationRepository.findReportByCode(guildId, code);
        if (!found) throw ApiError.notFound(`Report #${code}`);

        return ModerationService.toReportDto(found);
    }

    /**
     * Claims an open report.
     *
     * @throws CONFLICT when somebody else already holds it — which is the ordinary outcome for
     *         every staff member except the first, not an error worth logging as one.
     */
    static async claim(input: {
        guildId: string;
        reportId: string;
        staffUuid: string;
        staffUsername: string;
    }): Promise<ReportDto> {
        // Resolved first so the atomic claim below runs against the real id whether the caller typed
        // a code or passed one through from the GUI.
        const existing = await MinecraftModerationRepository.findReportByCode(input.guildId, input.reportId);
        if (!existing) throw ApiError.notFound(`Report #${input.reportId}`);

        const claimed = await MinecraftModerationRepository.claimReport(input.guildId, String(existing._id), {
            uuid: normaliseUuid(input.staffUuid),
            username: input.staffUsername,
        });

        if (!claimed) {
            // Distinguished from "no such report" so the plugin can show the right message: one is
            // "somebody beat you to it", the other is a report that has already been settled.
            throw ApiError.conflict(
                existing.assignedToUsername
                    ? `Report #${existing.code} has already been claimed by ${existing.assignedToUsername}.`
                    : `Report #${existing.code} is no longer open.`,
            );
        }

        return ModerationService.toReportDto(claimed);
    }

    /**
     * Accepts or refuses a report.
     *
     * <h2>Order: settle, then punish, then notify</h2>
     *
     * The status change comes first and is atomic, so two staff members clicking Accept within the
     * same second produce exactly one acceptance and one jail — the loser is told the report is
     * already closed rather than watching a second jail attempt fail with "already jailed", which
     * reads as a broken button rather than as a race correctly lost.
     *
     * The jail comes second. If it cannot be opened — almost always because the player is already
     * serving a sentence — the acceptance still stands and the reason is returned rather than
     * thrown: the staff member's decision was recorded, and telling them it failed outright would
     * invite them to click again on a report that is no longer open.
     *
     * Mail comes last and never fails the call. By the time it runs somebody is jailed; refusing the
     * whole request because a notification could not be written would leave the caller believing the
     * punishment did not happen either.
     */
    static async decide(input: {
        guildId: string;
        serverId: string;
        reportId: string;
        decision: "accept" | "refuse";
        staffUuid: string;
        staffUsername: string;
        jailDurationMs?: number | null;
        note?: string;
    }): Promise<DecideReportResponse> {
        const existing = await MinecraftModerationRepository.findReportByCode(input.guildId, input.reportId);
        if (!existing) throw ApiError.notFound(`Report #${input.reportId}`);

        const accepted = input.decision === "accept";

        const settled = await MinecraftModerationRepository.decideReport(
            input.guildId,
            String(existing._id),
            { uuid: normaliseUuid(input.staffUuid), username: input.staffUsername },
            accepted ? "accepted" : "refused",
            input.note,
        );

        if (!settled) {
            // Re-read rather than describing `existing`. Losing this race means the report was
            // settled between the lookup above and the update, so the copy in hand still says
            // "open" — and reporting that back would produce "already been open by nobody", which
            // tells the staff member nothing about what actually happened to their click.
            const current = await MinecraftModerationRepository.findReportByCode(input.guildId, input.reportId);

            throw ApiError.conflict(
                `Report #${current?.code ?? existing.code} has already been ${current?.status ?? "settled"} by ` +
                `${current?.resolvedByUsername ?? "another staff member"}.`,
            );
        }

        const reason = input.note?.trim() || settled.reason;

        let jailed = false;
        let jailSkippedReason: string | null = null;

        if (accepted) {
            const outcome = await this.jailReportedPlayer({
                guildId: input.guildId,
                serverId: input.serverId,
                report: settled,
                staffUuid: input.staffUuid,
                staffUsername: input.staffUsername,
                durationMs: input.jailDurationMs ?? null,
                reason,
            });

            jailed = outcome.jailed;
            jailSkippedReason = outcome.skipped;

            if (jailed) {
                await MinecraftModerationRepository.markReportJailed(input.guildId, String(settled._id));
            }
        }

        const mailSent = await MailService.sendAll(
            this.mailFor({
                guildId: input.guildId,
                serverId: input.serverId,
                report: settled,
                accepted,
                jailed,
                reason,
                durationMs: input.jailDurationMs ?? null,
            }),
        );

        return {
            report: ModerationService.toReportDto(settled),
            jailed,
            jailSkippedReason,
            mailSent,
        };
    }

    /**
     * Opens the sentence an accepted report earns.
     *
     * A conflict here is an ordinary outcome, not a failure: the reported player may already be
     * jailed from an earlier report, and the honest answer is "accepted, but they were already
     * serving" rather than either a thrown error or a silent success.
     */
    private static async jailReportedPlayer(input: {
        guildId: string;
        serverId: string;
        report: { targetUuid: string; targetUsername: string };
        staffUuid: string;
        staffUsername: string;
        durationMs: number | null;
        reason: string;
    }): Promise<{ jailed: boolean; skipped: string | null }> {
        try {
            await ModerationService.jail({
                guildId: input.guildId,
                targetUuid: input.report.targetUuid,
                targetUsername: input.report.targetUsername,
                serverId: input.serverId,
                moderatorUuid: input.staffUuid,
                moderatorUsername: input.staffUsername,
                durationMs: input.durationMs,
                reason: input.reason,
            });

            return { jailed: true, skipped: null };
        } catch (error) {
            if (error instanceof ApiError && error.code === API_ERROR_CODES.conflict) {
                return { jailed: false, skipped: error.message };
            }
            throw error;
        }
    }

    /** The mail an accepted or refused report produces: always the reporter, the target when jailed. */
    private static mailFor(input: {
        guildId: string;
        serverId: string;
        report: { _id: unknown; code: string; reporterUuid: string; reporterUsername: string; targetUuid: string; targetUsername: string; reason: string };
        accepted: boolean;
        jailed: boolean;
        reason: string;
        durationMs: number | null;
    }): MailInput[] {
        const { report } = input;
        const referenceId = String(report._id);
        const duration = formatDuration(input.durationMs);

        const mails: MailInput[] = [
            {
                guildId: input.guildId,
                recipientUuid: report.reporterUuid,
                recipientUsername: report.reporterUsername,
                category: input.accepted ? "report_accepted" : "report_refused",
                subject: input.accepted ? `Report #${report.code} accepted` : `Report #${report.code} refused`,
                body: input.accepted
                    ? [
                          `Your report against ${report.targetUsername} was accepted.`,
                          "",
                          `Reason: ${report.reason}`,
                          "",
                          input.jailed
                              ? `${report.targetUsername} has been jailed (${duration}).`
                              : `${report.targetUsername} is already serving a sentence.`,
                          "",
                          "Thank you for reporting.",
                      ]
                    : [
                          `Your report against ${report.targetUsername} was reviewed and no action was taken.`,
                          "",
                          `Reason given: ${report.reason}`,
                          "",
                          "If you believe this is a mistake, please open it with the staff team.",
                      ],
                important: true,
                referenceId,
                serverId: input.serverId,
            },
        ];

        // Only when a sentence was actually opened. Telling somebody they have been jailed when an
        // earlier sentence is what is holding them would be a second, wrong explanation.
        if (input.accepted && input.jailed) {
            mails.push({
                guildId: input.guildId,
                recipientUuid: report.targetUuid,
                recipientUsername: report.targetUsername,
                category: "jailed",
                subject: "You have been jailed",
                body: [
                    "You have been jailed following a player report.",
                    "",
                    `Reason: ${input.reason}`,
                    `Duration: ${duration}`,
                    "",
                    "You will be released automatically when your sentence ends.",
                ],
                important: true,
                referenceId,
                serverId: input.serverId,
            });
        }

        return mails;
    }

    /**
     * Closes a report as resolved or dismissed.
     *
     * Kept alongside {@link decide} rather than replaced by it: closing records that a report was
     * dealt with, and carries no punishment and no mail. `/report close` after a conversation with
     * the reporter is a different act from upholding the report against somebody.
     */
    static async close(input: {
        guildId: string;
        reportId: string;
        staffUuid: string;
        staffUsername: string;
        status: "resolved" | "dismissed";
        note?: string;
    }): Promise<ReportDto> {
        const existing = await MinecraftModerationRepository.findReportByCode(input.guildId, input.reportId);
        if (!existing) throw ApiError.notFound(`Report #${input.reportId}`);

        const closed = await MinecraftModerationRepository.resolveReport(
            input.guildId,
            String(existing._id),
            { uuid: normaliseUuid(input.staffUuid), username: input.staffUsername },
            input.status,
            input.note,
        );

        if (!closed) throw ApiError.conflict(`Report #${existing.code} is already closed.`);

        return ModerationService.toReportDto(closed);
    }

    /** The report this staff member currently holds, for restoring a chat session after a restart. */
    static async activeClaim(guildId: string, staffUuid: string): Promise<ReportDto | null> {
        const held = await MinecraftModerationRepository.activeClaim(guildId, normaliseUuid(staffUuid));
        return held ? ModerationService.toReportDto(held) : null;
    }

    /**
     * The counts behind the report placeholders, plus this staff member's own tallies.
     *
     * One call rather than five, because the plugin refreshes all of them together on a timer and
     * five round trips per refresh would be the request volume the cache exists to avoid.
     */
    static async counts(guildId: string, staffUuid?: string): Promise<{
        open: number;
        reviewing: number;
        accepted: number;
        refused: number;
        resolved: number;
        dismissed: number;
        claimedByStaff: number;
        handledByStaff: number;
    }> {
        const counts = await MinecraftModerationRepository.reportCounts(guildId);

        if (!staffUuid) {
            return { ...counts, claimedByStaff: 0, handledByStaff: 0 };
        }

        const uuid = normaliseUuid(staffUuid);
        const [claimedByStaff, handledByStaff] = await Promise.all([
            MinecraftModerationRepository.countClaimedBy(guildId, uuid),
            MinecraftModerationRepository.countHandledBy(guildId, uuid),
        ]);

        return { ...counts, claimedByStaff, handledByStaff };
    }
}
