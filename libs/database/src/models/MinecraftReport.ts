import { Schema, model, type Document } from "mongoose";

export const MINECRAFT_REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
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
