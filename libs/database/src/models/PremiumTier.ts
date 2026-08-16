import { Schema, model, type Document } from "mongoose";

/**
 * One premium tier, **global to the bot**.
 *
 * Prime means the same thing in every server the bot is in: the same rank, the same perks, the same
 * numbers. A server does not invent tiers or decide what they are worth — it only says which of its
 * own Discord roles grant one (see `PremiumRoleMap`).
 *
 * That is the whole reason the ladder is not per guild. A membership someone paid for has to be
 * worth the same wherever they use it, and a per-guild ladder would mean one server could quietly
 * make Prime worthless or infinitely generous.
 */
export interface IPremiumTier extends Document {
    /** Stable slug: `prime`, `prime-plus`, `lifetime`. Referenced by role maps and feature values. */
    key: string;
    name: string;
    /** Higher wins when a member holds several tiers. */
    rank: number;
    emoji: string;
    /** Hex colour for badges and the benefits embed, or null for the default. */
    color: string | null;
    /** Off keeps the tier and its values but stops it granting anything. */
    enabled: boolean;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const premiumTierSchema = new Schema<IPremiumTier>(
    {
        key: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        rank: { type: Number, required: true, default: 0 },
        emoji: { type: String, default: "💎" },
        color: { type: String, default: null },
        enabled: { type: Boolean, default: true },
        createdBy: { type: String, default: "" },
    },
    { timestamps: true }
);

premiumTierSchema.index({ rank: -1 });

export const PremiumTier = model<IPremiumTier>("PremiumTier", premiumTierSchema);
