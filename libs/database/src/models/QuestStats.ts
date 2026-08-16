import { Schema, model, type Document } from "mongoose";

/**
 * A member's lifetime quest record in one guild.
 *
 * Lifetime totals only. Daily/weekly/monthly figures come from PeriodicStat, which already backs
 * every other period-scoped board — the same split VoiceStat uses, and for the same reason:
 * duplicating period logic gives you two things to keep in step and two places to disagree.
 */
export interface IQuestStats extends Document {
    guildId: string;
    discordId: string;
    username: string;
    claimed: number;
    completed: number;
    failed: number;
    easyCompleted: number;
    normalCompleted: number;
    hardCompleted: number;
    goldenCompleted: number;
    vipCompleted: number;
    communityCompleted: number;
    /** Points earned from quest and community rewards alone. */
    pointsEarned: number;
    /** Sum of completion times, for the average. Paired with `completed`. */
    totalCompletionMs: number;
    /** Fastest completion in ms, or null with no completions. */
    fastestCompletionMs: number | null;
    /** Times this member finished a quest first. */
    firstPlaceFinishes: number;
    lastCompletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const questStatsSchema = new Schema<IQuestStats>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, default: "" },
        claimed: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        easyCompleted: { type: Number, default: 0 },
        normalCompleted: { type: Number, default: 0 },
        hardCompleted: { type: Number, default: 0 },
        goldenCompleted: { type: Number, default: 0 },
        vipCompleted: { type: Number, default: 0 },
        communityCompleted: { type: Number, default: 0 },
        pointsEarned: { type: Number, default: 0 },
        totalCompletionMs: { type: Number, default: 0 },
        fastestCompletionMs: { type: Number, default: null },
        firstPlaceFinishes: { type: Number, default: 0 },
        lastCompletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

questStatsSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
questStatsSchema.index({ guildId: 1, completed: -1 });

export const QuestStats = model<IQuestStats>("QuestStats", questStatsSchema);
