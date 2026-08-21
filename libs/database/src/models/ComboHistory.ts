import { Schema, model, type Document } from "mongoose";

export interface IComboHistory extends Document {
    guildId: string;
    userAId: string;
    userBId: string;
    participants: string[];
    score: number;
    level: string;
    durationMs: number;
    messages: number;
    endedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const comboHistorySchema = new Schema<IComboHistory>(
    {
        guildId: { type: String, required: true, index: true },
        userAId: { type: String, required: true },
        userBId: { type: String, required: true },
        participants: { type: [String], required: true },
        score: { type: Number, required: true },
        level: { type: String, required: true },
        durationMs: { type: Number, required: true },
        messages: { type: Number, required: true },
        endedAt: { type: Date, required: true },
    },
    { timestamps: true }
);

comboHistorySchema.index({ guildId: 1, participants: 1, endedAt: -1 });

export const ComboHistory = model<IComboHistory>("ComboHistory", comboHistorySchema);
