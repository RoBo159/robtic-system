import { Schema, model, type Document } from "mongoose";
import { STREAK_DEFAULTS } from "@constants";

export interface IStreakSettings extends Document {
    guildId: string;
    channels: string[];
    /** Where "you reached N days" is posted. Unset falls back to replying in the channel that earned it. */
    announceChannelId?: string;
    remindersEnabled: boolean;
    minMessageLength: number;
    /** Days after a claim before the next one is available. */
    claimDays: number;
    /** Days after a claim before the streak dies. Always greater than claimDays. */
    expireDays: number;
    /** Hours after expiry during which staff may give the streak back. */
    returnWindowHours: number;
    /** Roles allowed to return a streak, on top of administrators. */
    returnRoleIds: string[];
    /** A Discord timeout ends the streak — which covers /mute, /jail and warn auto-mutes. */
    breakOnTimeout: boolean;
    /** Being kicked ends the streak. */
    breakOnKick: boolean;
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
        claimDays: { type: Number, default: STREAK_DEFAULTS.claimDays },
        expireDays: { type: Number, default: STREAK_DEFAULTS.expireDays },
        returnWindowHours: { type: Number, default: STREAK_DEFAULTS.returnWindowHours },
        returnRoleIds: [{ type: String }],
        breakOnTimeout: { type: Boolean, default: STREAK_DEFAULTS.breakOnTimeout },
        breakOnKick: { type: Boolean, default: STREAK_DEFAULTS.breakOnKick },
    },
    { timestamps: true }
);

export const StreakSettings = model<IStreakSettings>("StreakSettings", streakSettingsSchema);
