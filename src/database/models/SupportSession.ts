import { Schema, model, type Document } from "mongoose";

export interface ISupportSession extends Document {
    guildId: string;
    channelId: string;
    userMessageId: string;
    userId: string;
    claimedBy: string | null;
    claimedAt: Date | null;
    respondedAt: Date | null;
    responseTimeMs: number | null;
    pointsAwarded: number;
    resolved: boolean;
    sessionQuality: "professional" | "normal" | "bad" | null;
    userSentiment: "positive" | "negative" | "neutral" | null;
    staffMessages: string[];
    createdAt: Date;
    updatedAt: Date;
}

const supportSessionSchema = new Schema<ISupportSession>(
    {
        guildId: { type: String, required: true, index: true },
        channelId: { type: String, required: true, index: true },
        userMessageId: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        claimedBy: { type: String, default: null },
        claimedAt: { type: Date, default: null },
        respondedAt: { type: Date, default: null },
        responseTimeMs: { type: Number, default: null },
        pointsAwarded: { type: Number, default: 0 },
        resolved: { type: Boolean, default: false },
        sessionQuality: { type: String, enum: ["professional", "normal", "bad", null], default: null },
        userSentiment: { type: String, enum: ["positive", "negative", "neutral", null], default: null },
        staffMessages: { type: [String], default: [] },
    },
    { timestamps: true }
);

supportSessionSchema.index({ channelId: 1, resolved: 1 });
supportSessionSchema.index({ claimedBy: 1 });

export const SupportSession = model<ISupportSession>("SupportSession", supportSessionSchema);
