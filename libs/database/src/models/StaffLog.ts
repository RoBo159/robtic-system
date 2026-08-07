import { Schema, model, type Document } from "mongoose";
import { STAFF_ACTIONS, type StaffAction } from "@sdk";

/**
 * The permanent audit trail. Every staff action funnels through one write here, which is what
 * makes "who did what, where, and when" answerable without joining six collections.
 *
 * Rows carry the originating server so a multi-server network can attribute an action correctly.
 */
export interface IStaffLog extends Document {
    guildId: string;
    action: StaffAction;
    serverId: string;
    actorUuid?: string;
    actorUsername?: string;
    actorDiscordId?: string;
    targetUuid?: string;
    targetUsername?: string;
    targetDiscordId?: string;
    reason?: string;
    /** Human-readable span for a timed action, e.g. "2h 30m". */
    duration?: string;
    /** Action-specific extras, rendered as additional embed fields. */
    metadata: Record<string, unknown>;
    /** When the action happened in game, which can precede when it was delivered. */
    occurredAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const staffLogSchema = new Schema<IStaffLog>(
    {
        guildId: { type: String, required: true, index: true },
        action: { type: String, required: true, enum: [...STAFF_ACTIONS], index: true },
        serverId: { type: String, required: true, trim: true },
        actorUuid: { type: String, lowercase: true, trim: true, index: true },
        actorUsername: { type: String, trim: true },
        actorDiscordId: { type: String },
        targetUuid: { type: String, lowercase: true, trim: true, index: true },
        targetUsername: { type: String, trim: true },
        targetDiscordId: { type: String },
        reason: { type: String, trim: true },
        duration: { type: String, trim: true },
        metadata: { type: Schema.Types.Mixed, default: {} },
        occurredAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

staffLogSchema.index({ guildId: 1, occurredAt: -1 });
staffLogSchema.index({ guildId: 1, actorUuid: 1, occurredAt: -1 });

export const StaffLog = model<IStaffLog>("StaffLog", staffLogSchema);
