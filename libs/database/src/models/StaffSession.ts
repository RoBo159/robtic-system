import { Schema, model, type Document } from "mongoose";

/** How a staff-mode session ended, which is what separates a clean exit from a crash recovery. */
export const STAFF_SESSION_END_REASONS = ["command", "disconnect", "shutdown", "recovery"] as const;
export type StaffSessionEndReason = typeof STAFF_SESSION_END_REASONS[number];

/**
 * One period a staff member spent in staff mode. Rows are never deleted — they are the source of
 * the on-duty hours and average-session figures the staff analytics report.
 */
export interface IStaffSession extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    discordId?: string;
    serverId: string;
    /** LuckPerms group applied for the duration. */
    rankGroup: string;
    rankName: string;
    /** Group restored when the session ends. */
    baseGroup: string;
    startedAt: Date;
    endedAt?: Date;
    endReason?: StaffSessionEndReason;
    /** Set on close so the analytics query never has to compute it. */
    durationMs?: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const staffSessionSchema = new Schema<IStaffSession>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        discordId: { type: String, index: true },
        serverId: { type: String, required: true, trim: true },
        rankGroup: { type: String, required: true },
        rankName: { type: String, required: true },
        baseGroup: { type: String, default: "staff" },
        startedAt: { type: Date, default: Date.now },
        endedAt: { type: Date },
        endReason: { type: String, enum: [...STAFF_SESSION_END_REASONS] },
        durationMs: { type: Number },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

staffSessionSchema.index({ guildId: 1, minecraftUuid: 1, active: 1 });
staffSessionSchema.index({ guildId: 1, startedAt: -1 });

export const StaffSession = model<IStaffSession>("StaffSession", staffSessionSchema);
