import { Schema, model, type Document } from "mongoose";

export interface IPunishment extends Document {
    caseId: string;
    guildId: string;
    userId: string;
    moderatorId: string;
    type: "warn" | "mute" | "tempban" | "ban" | "kick";
    reason: string;
    duration: number | null;
    expiresAt: Date | null;
    active: boolean;
    appealed: boolean;
    appealReason: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const punishmentSchema = new Schema<IPunishment>(
    {
        caseId: { type: String, required: true, unique: true, index: true },
        guildId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        moderatorId: { type: String, required: true },
        type: {
            type: String,
            enum: ["warn", "mute", "tempban", "ban", "kick"],
            required: true,
        },
        reason: { type: String, required: true },
        duration: { type: Number, default: null },
        expiresAt: { type: Date, default: null, index: true },
        active: { type: Boolean, default: true, index: true },
        appealed: { type: Boolean, default: false },
        appealReason: { type: String, default: null },
    },
    { timestamps: true }
);

punishmentSchema.index({ guildId: 1, userId: 1, active: 1 });
punishmentSchema.index({ expiresAt: 1, active: 1 });

export const Punishment = model<IPunishment>("Punishment", punishmentSchema);
