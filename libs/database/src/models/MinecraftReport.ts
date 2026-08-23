import { Schema, model, type Document } from "mongoose";

/**
 * The report lifecycle.
 *
 * `reviewing` sits between open and resolved: a report a staff member has claimed but not yet
 * finished with. Without it a claimed report is indistinguishable from an unclaimed one, so two
 * staff members can pick up the same case and a queue count cannot tell "waiting" from "being
 * handled" — which is the whole point of claiming.
 */
export const MINECRAFT_REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type MinecraftReportStatus = typeof MINECRAFT_REPORT_STATUSES[number];

/**
 * A player report filed in game with `/report`. Visible only to staff, kept permanently, and
 * counted towards the reporter's target's history so a repeatedly reported player surfaces in the
 * join alert.
 */
export interface IMinecraftReport extends Document {
    guildId: string;
    serverId: string;
    reporterUuid: string;
    reporterUsername: string;
    targetUuid: string;
    targetUsername: string;
    reason: string;
    status: MinecraftReportStatus;

    /**
     * The staff member who claimed it, set when the status becomes `reviewing`.
     *
     * Assignment and status change together, atomically — see the repository's `claim`. Recording
     * one without the other is what allows a second staff member to claim an already-claimed
     * report, so they are never written separately.
     */
    assignedToUuid?: string;
    assignedToUsername?: string;
    claimedAt?: Date;

    resolvedByUuid?: string;
    resolvedByUsername?: string;
    resolvedAt?: Date;
    resolutionNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftReportSchema = new Schema<IMinecraftReport>(
    {
        guildId: { type: String, required: true, index: true },
        serverId: { type: String, required: true, trim: true },
        reporterUuid: { type: String, required: true, lowercase: true, trim: true },
        reporterUsername: { type: String, required: true, trim: true },
        targetUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        targetUsername: { type: String, required: true, trim: true },
        reason: { type: String, required: true, trim: true },
        status: { type: String, enum: [...MINECRAFT_REPORT_STATUSES], default: "open", index: true },
        assignedToUuid: { type: String, lowercase: true, trim: true, index: true },
        assignedToUsername: { type: String, trim: true },
        claimedAt: { type: Date },
        resolvedByUuid: { type: String, lowercase: true, trim: true },
        resolvedByUsername: { type: String, trim: true },
        resolvedAt: { type: Date },
        resolutionNote: { type: String, trim: true },
    },
    { timestamps: true }
);

minecraftReportSchema.index({ guildId: 1, status: 1, createdAt: -1 });
minecraftReportSchema.index({ guildId: 1, targetUuid: 1, createdAt: -1 });

export const MinecraftReport = model<IMinecraftReport>("MinecraftReport", minecraftReportSchema);
