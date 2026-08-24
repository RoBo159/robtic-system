import { MinecraftWarning, type IMinecraftWarning } from "@database/models/MinecraftWarning";
import { MinecraftNote, type IMinecraftNote } from "@database/models/MinecraftNote";
import {
    MINECRAFT_REPORT_OPEN_STATUSES,
    MinecraftReport,
    type IMinecraftReport,
    type IMinecraftReportLocation,
    type MinecraftReportStatus,
} from "@database/models/MinecraftReport";

/** How many times a colliding six-digit code is regenerated before giving up. */
const CODE_ATTEMPTS = 12;

/** Mongo's duplicate-key error. The only failure `addReport` retries rather than propagates. */
const DUPLICATE_KEY = 11000;

/**
 * A fresh six-digit code.
 *
 * Always six digits — the range starts at 100000 rather than 0 so a code never has to be printed
 * with leading zeros, which is exactly the sort of thing that gets dropped when somebody retypes it
 * from a Discord embed.
 */
function newReportCode(): string {
    return String(100000 + Math.floor(Math.random() * 900000));
}

function isDuplicateKey(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: number }).code === DUPLICATE_KEY;
}

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

    /**
     * Files a report, assigning it a six-digit code unique within the guild.
     *
     * <h2>Write-and-retry, not check-and-write</h2>
     *
     * Asking "is this code taken?" and then inserting leaves a window in which two reports filed in
     * the same moment both pass the check and both write the same code. The unique index on
     * `{ guildId, code }` closes it: the second insert fails with a duplicate-key error, and this
     * retries with a new code. So the check *is* the write.
     *
     * With six digits the collision probability is negligible until a guild holds tens of thousands
     * of reports, and {@link CODE_ATTEMPTS} attempts is far past the point where a genuine outage,
     * not exhaustion, is the explanation — which is why the failure is thrown rather than falling
     * back to a longer code that staff would then have to type.
     */
    static async addReport(input: {
        guildId: string;
        serverId: string;
        reporterUuid: string;
        reporterUsername: string;
        reporterDiscordId?: string;
        reporterLocation?: IMinecraftReportLocation;
        targetUuid: string;
        targetUsername: string;
        targetDiscordId?: string;
        targetLocation?: IMinecraftReportLocation;
        targetOnline?: boolean;
        reason: string;
    }): Promise<IMinecraftReport> {
        const document = {
            ...input,
            reporterUuid: input.reporterUuid.toLowerCase(),
            targetUuid: input.targetUuid.toLowerCase(),
            targetOnline: input.targetOnline ?? false,
        };

        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            try {
                return await MinecraftReport.create({ ...document, code: newReportCode() });
            } catch (error) {
                if (!isDuplicateKey(error)) throw error;
            }
        }

        throw new Error(
            `Could not allocate a unique report code after ${CODE_ATTEMPTS} attempts — the report was not filed.`,
        );
    }

    /**
     * The report behind a six-digit code.
     *
     * This is the lookup every staff-facing path goes through, because the code is the only
     * identifier a human ever sees. Falls back to treating the input as an ObjectId so a report
     * clicked in the GUI — which has the real id in hand — does not need a second round trip.
     */
    static async findReportByCode(guildId: string, code: string): Promise<IMinecraftReport | null> {
        const trimmed = code.trim();

        const byCode = await MinecraftReport.findOne({ guildId, code: trimmed });
        if (byCode) return byCode;

        // An ObjectId is 24 hex characters; anything else cannot be one, and handing Mongo a
        // malformed id throws a cast error rather than returning null.
        if (!/^[0-9a-f]{24}$/i.test(trimmed)) return null;

        return MinecraftReport.findOne({ _id: trimmed, guildId });
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

    /** Counts by status, for the placeholder cache. One aggregate rather than six queries. */
    static async reportCounts(guildId: string): Promise<Record<MinecraftReportStatus, number>> {
        const rows = await MinecraftReport.aggregate<{ _id: MinecraftReportStatus; count: number }>([
            { $match: { guildId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        const counts = {
            open: 0,
            reviewing: 0,
            accepted: 0,
            refused: 0,
            resolved: 0,
            dismissed: 0,
        } as Record<MinecraftReportStatus, number>;

        for (const row of rows) {
            // Guarded rather than assigned blind: a status written by an older build that this one
            // no longer knows about must not add an undefined key to a record the API returns.
            if (row._id in counts) counts[row._id] = row.count;
        }
        return counts;
    }

    /**
     * Settles a report as accepted or refused.
     *
     * <h2>Why this is one atomic update and not a read followed by a write</h2>
     *
     * Accepting a report jails somebody. Two staff members clicking Accept on the same report within
     * the same second would, with a read-then-write, both see it open and both proceed — and the
     * second jail attempt fails with "already jailed", which reads as a broken button rather than as
     * a race that was correctly lost. Filtering on the open statuses means exactly one caller gets a
     * document back and everybody else gets null, so the jail is only ever attempted by the winner.
     *
     * @returns the settled report, or null when it was already closed by somebody else.
     */
    static async decideReport(
        guildId: string,
        reportId: string,
        staff: { uuid: string; username: string },
        decision: "accepted" | "refused",
        note?: string,
    ): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOneAndUpdate(
            { _id: reportId, guildId, status: { $in: MINECRAFT_REPORT_OPEN_STATUSES } },
            {
                $set: {
                    status: decision,
                    resolvedByUuid: staff.uuid.toLowerCase(),
                    resolvedByUsername: staff.username,
                    resolvedAt: new Date(),
                    resolutionNote: note,
                },
            },
            { returnDocument: "after" }
        );
    }

    /** Records that accepting a report opened a jail sentence, so the two can be traced together. */
    static async markReportJailed(guildId: string, reportId: string): Promise<void> {
        await MinecraftReport.updateOne({ _id: reportId, guildId }, { $set: { jailApplied: true } });
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
        status: "resolved" | "dismissed",
        note?: string,
    ): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOneAndUpdate(
            { _id: reportId, guildId, status: { $in: MINECRAFT_REPORT_OPEN_STATUSES } },
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
