import { Schema, model, type Document } from "mongoose";

export interface IActivityXP extends Document {
    discordId: string;
    guildId: string;
    username: string;
    totalXP: number;
    level: number;
    messageCount: number;
    lastMessageAt: Date;
    lastXPGrant: Date;
    spamCount: number;
    currentRole: string;
    createdAt: Date;
    updatedAt: Date;
}

const activityXPSchema = new Schema<IActivityXP>(
    {
        discordId: { type: String, required: true, index: true },
        guildId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        totalXP: { type: Number, default: 0, index: true },
        level: { type: Number, default: 0 },
        messageCount: { type: Number, default: 0 },
        lastMessageAt: { type: Date, default: Date.now },
        lastXPGrant: { type: Date, default: new Date(0) },
        spamCount: { type: Number, default: 0 },
        currentRole: { type: String, default: "Member" },
    },
    { timestamps: true }
);

activityXPSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
activityXPSchema.index({ guildId: 1, totalXP: -1 });

export const ActivityXP = model<IActivityXP>("ActivityXP", activityXPSchema);
