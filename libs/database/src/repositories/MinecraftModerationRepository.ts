import { MinecraftWarning, type IMinecraftWarning } from "@database/models/MinecraftWarning";
import { MinecraftNote, type IMinecraftNote } from "@database/models/MinecraftNote";
import { MinecraftReport, type IMinecraftReport, type MinecraftReportStatus } from "@database/models/MinecraftReport";

/** Shared shape for the three player-attached records staff create in game. */
interface EntryInput {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    authorUuid: string;
    authorUsername: string;
    text: string;
}

/**
 * Warnings, notes and reports.
 *
 * They share one repository because they share one lifecycle — created in game by staff, attached
 * to a player, read back together by the player-management GUI and the join alert. Splitting them
 * across three classes would mean three near-identical files and three round trips where the GUI
 * needs one.
 */
export class MinecraftModerationRepository {
    static async addWarning(input: EntryInput): Promise<IMinecraftWarning> {
        return MinecraftWarning.create({
            guildId: input.guildId,
            minecraftUuid: input.minecraftUuid.toLowerCase(),
            minecraftUsername: input.minecraftUsername,
            serverId: input.serverId,
            reason: input.text,
            issuedByUuid: input.authorUuid.toLowerCase(),
            issuedByUsername: input.authorUsername,
        });
    }

    static async listWarnings(guildId: string, minecraftUuid: string, limit = 50): Promise<IMinecraftWarning[]> {
        return MinecraftWarning.find({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), removed: false })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async countWarnings(guildId: string, minecraftUuid: string): Promise<number> {
        return MinecraftWarning.countDocuments({
            guildId,
            minecraftUuid: minecraftUuid.toLowerCase(),
            removed: false,
        });
    }

    /** Marks rather than deletes, so the removal is itself part of the record. */
    static async removeWarning(guildId: string, warningId: string, removedByUuid: string): Promise<IMinecraftWarning | null> {
        return MinecraftWarning.findOneAndUpdate(
            { _id: warningId, guildId, removed: false },
            { $set: { removed: true, removedAt: new Date(), removedByUuid: removedByUuid.toLowerCase() } },
            { returnDocument: "after" }
        );
    }

    static async addNote(input: EntryInput): Promise<IMinecraftNote> {
        return MinecraftNote.create({
            guildId: input.guildId,
            minecraftUuid: input.minecraftUuid.toLowerCase(),
            minecraftUsername: input.minecraftUsername,
            serverId: input.serverId,
            text: input.text,
            authorUuid: input.authorUuid.toLowerCase(),
            authorUsername: input.authorUsername,
        });
    }

    static async listNotes(guildId: string, minecraftUuid: string, limit = 50): Promise<IMinecraftNote[]> {
        return MinecraftNote.find({ guildId, minecraftUuid: minecraftUuid.toLowerCase() })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async countNotes(guildId: string, minecraftUuid: string): Promise<number> {
        return MinecraftNote.countDocuments({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    static async addReport(input: {
        guildId: string;
        serverId: string;
        reporterUuid: string;
        reporterUsername: string;
        targetUuid: string;
        targetUsername: string;
        reason: string;
    }): Promise<IMinecraftReport> {
        return MinecraftReport.create({
            ...input,
            reporterUuid: input.reporterUuid.toLowerCase(),
            targetUuid: input.targetUuid.toLowerCase(),
        });
    }

    static async listReports(guildId: string, status?: MinecraftReportStatus, limit = 50): Promise<IMinecraftReport[]> {
        return MinecraftReport.find({ guildId, ...(status ? { status } : {}) })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async listReportsAgainst(guildId: string, targetUuid: string, limit = 50): Promise<IMinecraftReport[]> {
        return MinecraftReport.find({ guildId, targetUuid: targetUuid.toLowerCase() })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async countReportsAgainst(guildId: string, targetUuid: string): Promise<number> {
        return MinecraftReport.countDocuments({ guildId, targetUuid: targetUuid.toLowerCase() });
    }

    /**
     * Claims an open report for one staff member.
     *
     * <h2>The race is the whole point</h2>
     *
     * Every staff member in staff mode is shown the same [Accept] button, so several will click it
     * within the same second. The `status: "open"` in the filter is what settles it: the update is
     * a single atomic document operation, so exactly one writer transitions the report out of
     * `open` and everybody else matches nothing and gets null back.
     *
     * Checking first and then writing — in the API, or worse in the plugin's memory — would leave a
     * window where two staff members both pass the check. There is no such window here.
     *
     * @returns the claimed report, or null when somebody else got there first.
     */
    static async claimReport(
        guildId: string,
        reportId: string,
        staff: { uuid: string; username: string },
    ): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOneAndUpdate(
            { _id: reportId, guildId, status: "open" },
            {
                $set: {
                    status: "reviewing",
                    assignedToUuid: staff.uuid.toLowerCase(),
                    assignedToUsername: staff.username,
                    claimedAt: new Date(),
                },
            },
            { returnDocument: "after" }
        );
    }

    /** The report a staff member currently has claimed, if any. Backs the private chat session. */
    static async activeClaim(guildId: string, staffUuid: string): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOne({
            guildId,
            status: "reviewing",
            assignedToUuid: staffUuid.toLowerCase(),
        }).sort({ claimedAt: -1 });
    }

    /** Counts by status, for the placeholder cache. One aggregate rather than four queries. */
    static async reportCounts(guildId: string): Promise<Record<MinecraftReportStatus, number>> {
        const rows = await MinecraftReport.aggregate<{ _id: MinecraftReportStatus; count: number }>([
            { $match: { guildId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        const counts = { open: 0, reviewing: 0, resolved: 0, dismissed: 0 } as Record<MinecraftReportStatus, number>;
        for (const row of rows) {
            counts[row._id] = row.count;
        }
        return counts;
    }

    /** How many reports this staff member has handled, for `%robtic_staff_total_cases%`. */
    static async countHandledBy(guildId: string, staffUuid: string): Promise<number> {
        return MinecraftReport.countDocuments({ guildId, resolvedByUuid: staffUuid.toLowerCase() });
    }

    /** Reports this staff member currently holds. */
    static async countClaimedBy(guildId: string, staffUuid: string): Promise<number> {
        return MinecraftReport.countDocuments({
            guildId,
            status: "reviewing",
            assignedToUuid: staffUuid.toLowerCase(),
        });
    }

    /**
     * Closes a report.
     *
     * Accepts it from `open` or `reviewing` — a claimed report is the normal path, but a staff
     * member resolving an unclaimed one directly should not be refused for skipping a step.
     */
    static async resolveReport(
        guildId: string,
        reportId: string,
        resolver: { uuid: string; username: string },
        status: Exclude<MinecraftReportStatus, "open" | "reviewing">,
        note?: string,
    ): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOneAndUpdate(
            { _id: reportId, guildId, status: { $in: ["open", "reviewing"] } },
            {
                $set: {
                    status,
                    resolvedByUuid: resolver.uuid.toLowerCase(),
                    resolvedByUsername: resolver.username,
                    resolvedAt: new Date(),
                    resolutionNote: note,
                },
            },
            { returnDocument: "after" }
        );
    }
}
