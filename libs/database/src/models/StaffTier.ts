import { Schema, model, type Document } from "mongoose";

/**
 * One per-guild staff tier: a named rank, a 0-100 score, and the roles that grant it. Commands are
 * gated by comparing a member's best matching tier score against `requiredPermission`.
 *
 * Scores are per-guild data rather than a hardcoded ladder, because a single fixed tier set can't
 * fit every server this bot runs on.
 */
export interface IStaffTier extends Document {
    guildId: string;
    key: string;
    name: string;
    score: number;
    roleIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

const staffTierSchema = new Schema<IStaffTier>(
    {
        guildId: { type: String, required: true, index: true },
        key: { type: String, required: true },
        name: { type: String, required: true },
        score: { type: Number, required: true, default: 0 },
        roleIds: { type: [String], default: [] },
    },
    { timestamps: true }
);

staffTierSchema.index({ guildId: 1, key: 1 }, { unique: true });

export const StaffTier = model<IStaffTier>("StaffTier", staffTierSchema);
