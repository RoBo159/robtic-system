import { Schema, model, type Document } from "mongoose";
import type { ComboLeaderboardPeriod } from "@constants";

/**
 * Cumulative counters that need a per-period delta view.
 *
 * `voiceTime` is stored in seconds and `voiceXp` in XP, both accumulated the same way as chat XP —
 * which is what lets the voice leaderboards reuse the existing period machinery rather than
 * carrying their own daily/weekly/monthly tables.
 */
export type PeriodicStatMetric = "xp" | "messages" | "voiceTime" | "voiceXp";

/**
 * Per-period, per-user running totals for cumulative counters (XP gained, messages sent) that need
 * a delta-per-period view rather than a snapshot of the running total — unlike ComboLeaderboardEntry's
 * $max-of-a-bounded-score model, these are built via $inc so "weekly top XP" reflects XP gained that
 * week, not the all-time leader every time.
 */
export interface IPeriodicStat extends Document {
    guildId: string;
    period: ComboLeaderboardPeriod;
    periodKey: string;
    metric: PeriodicStatMetric;
    discordId: string;
    value: number;
    createdAt: Date;
    updatedAt: Date;
}

const periodicStatSchema = new Schema<IPeriodicStat>(
    {
        guildId: { type: String, required: true },
        period: { type: String, enum: ["daily", "weekly", "monthly", "alltime"], required: true },
        periodKey: { type: String, required: true },
        metric: { type: String, enum: ["xp", "messages", "voiceTime", "voiceXp"], required: true },
        discordId: { type: String, required: true },
        value: { type: Number, required: true, default: 0 },
    },
    { timestamps: true }
);

periodicStatSchema.index(
    { guildId: 1, period: 1, periodKey: 1, metric: 1, discordId: 1 },
    { unique: true }
);
periodicStatSchema.index({ guildId: 1, period: 1, periodKey: 1, metric: 1, value: -1 });

export const PeriodicStat = model<IPeriodicStat>("PeriodicStat", periodicStatSchema);
