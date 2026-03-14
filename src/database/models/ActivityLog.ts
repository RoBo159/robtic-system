import { Schema, model, type Document } from "mongoose";

export type ActivityLogType =
    | "xp_gain"
    | "xp_decay"
    | "level_up"
    | "level_down"
    | "reward_granted"
    | "reward_removed"
    | "staff_public_points"
    | "staff_chat_points"
    | "support_points"
    | "support_claim"
    | "support_penalty"
    | "staff_penalty";

export interface IActivityLog extends Document {
    guildId: string;
    userId: string;
    type: ActivityLogType;
    amount: number;
    details: string;
    createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
    {
        guildId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        type: { type: String, required: true, index: true },
        amount: { type: Number, default: 0 },
        details: { type: String, default: "" },
    },
    { timestamps: true }
);

activityLogSchema.index({ userId: 1, type: 1 });
activityLogSchema.index({ createdAt: -1 });

export const ActivityLog = model<IActivityLog>("ActivityLog", activityLogSchema);
