import { ApiError, normaliseUuid, type ReportDto } from "@sdk";
import { MinecraftModerationRepository } from "@database/repositories";
import { ModerationService } from "./moderation-service";

/**
 * Claiming and closing reports.
 *
 * <h2>The API is the authority on ownership</h2>
 *
 * Every staff member in staff mode sees the same [Accept] button, so several will click it at once.
 * The plugin cannot settle that — its memory is per server, and two servers would both believe they
 * won. So the claim is a single atomic document update here, and the plugin does nothing but report
 * what this returned.
 *
 * Separate from {@link ModerationService}, which owns *filing* reports along with freezes, jails and
 * warnings. This owns the lifecycle a filed report moves through.
 */
export class ReportService {
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
        const claimed = await MinecraftModerationRepository.claimReport(input.guildId, input.reportId, {
            uuid: normaliseUuid(input.staffUuid),
            username: input.staffUsername,
        });

        if (!claimed) {
            // Distinguished from "no such report" so the plugin can show the right message: one is
            // "somebody beat you to it", the other is a stale button from a previous session.
            const existing = await MinecraftModerationRepository.listReports(input.guildId, undefined, 200);
            const found = existing.find(report => String(report._id) === input.reportId);

            if (!found) throw ApiError.notFound("That report");

            throw ApiError.conflict(
                found.assignedToUsername
                    ? `That report has already been claimed by ${found.assignedToUsername}.`
                    : "That report has already been claimed.",
            );
        }

        return ModerationService.toReportDto(claimed);
    }

    /**
     * Closes a report as resolved or dismissed.
     *
     * Accepts a report in either `open` or `reviewing`: normally the closer is the staff member who
     * claimed it, but somebody resolving an unclaimed report directly should not be refused for
     * skipping the claim.
     */
    static async close(input: {
        guildId: string;
        reportId: string;
        staffUuid: string;
        staffUsername: string;
        status: "resolved" | "dismissed";
        note?: string;
    }): Promise<ReportDto> {
        const closed = await MinecraftModerationRepository.resolveReport(
            input.guildId,
            input.reportId,
            { uuid: normaliseUuid(input.staffUuid), username: input.staffUsername },
            input.status,
            input.note,
        );

        if (!closed) throw ApiError.conflict("That report is already closed.");

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
