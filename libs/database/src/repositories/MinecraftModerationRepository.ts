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

    static async resolveReport(
        guildId: string,
        reportId: string,
        resolver: { uuid: string; username: string },
        status: Exclude<MinecraftReportStatus, "open">,
        note?: string,
    ): Promise<IMinecraftReport | null> {
        return MinecraftReport.findOneAndUpdate(
            { _id: reportId, guildId, status: "open" },
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
