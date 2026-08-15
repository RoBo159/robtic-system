import { Schema, model, type Document } from "mongoose";

/**
 * A member's lifetime voice totals in one guild.
 *
 * Daily, weekly and monthly figures are not stored here — they come from PeriodicStat, which
 * already backs every other period-scoped leaderboard. Duplicating that logic per period would
 * mean two things to keep in step and two places for them to disagree.
 */
export interface IVoiceStat extends Document {
    guildId: string;
    discordId: string;
    username: string;
    totalConnectedSeconds: number;
    totalActiveSeconds: number;
    totalXpEarned: number;
    sessionCount: number;
    /** Longest single session, in seconds. */
    longestSessionSeconds: number;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const voiceStatSchema = new Schema<IVoiceStat>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, default: "" },
        totalConnectedSeconds: { type: Number, default: 0 },
        totalActiveSeconds: { type: Number, default: 0 },
        totalXpEarned: { type: Number, default: 0 },
        sessionCount: { type: Number, default: 0 },
        longestSessionSeconds: { type: Number, default: 0 },
        lastSeenAt: { type: Date, default: null },
    },
    { timestamps: true }
);

voiceStatSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
voiceStatSchema.index({ guildId: 1, totalActiveSeconds: -1 });
voiceStatSchema.index({ guildId: 1, totalXpEarned: -1 });

export const VoiceStat = model<IVoiceStat>("VoiceStat", voiceStatSchema);
