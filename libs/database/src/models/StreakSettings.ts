import { Schema, model, type Document } from "mongoose";

export interface IStreakSettings extends Document {
    guildId: string;
    channels: string[];
    /** Where "you reached N days" is posted. Unset falls back to replying in the channel that earned it. */
    announceChannelId?: string;
    remindersEnabled: boolean;
    minMessageLength: number;
    createdAt: Date;
    updatedAt: Date;
}

const streakSettingsSchema = new Schema<IStreakSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        channels: [{ type: String }],
        announceChannelId: { type: String },
        remindersEnabled: { type: Boolean, default: true },
        minMessageLength: { type: Number, default: 5 },
    },
    { timestamps: true }
);

export const StreakSettings = model<IStreakSettings>("StreakSettings", streakSettingsSchema);
