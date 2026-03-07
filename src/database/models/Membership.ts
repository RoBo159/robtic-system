import { Schema, model, type Document } from "mongoose";

export interface IMembership extends Document {
    discordId: string;
    guildId: string;
    tier: string;
    active: boolean;
    startDate: Date;
    endDate: Date | null;
    isBooster: boolean;
    benefits: string[];
    createdAt: Date;
    updatedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
    {
        discordId: { type: String, required: true, index: true },
        guildId: { type: String, required: true, index: true },
        tier: { type: String, required: true },
        active: { type: Boolean, default: true, index: true },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date, default: null },
        isBooster: { type: Boolean, default: false },
        benefits: [{ type: String }],
    },
    { timestamps: true }
);

membershipSchema.index({ discordId: 1, guildId: 1 }, { unique: true });

export const Membership = model<IMembership>("Membership", membershipSchema);
