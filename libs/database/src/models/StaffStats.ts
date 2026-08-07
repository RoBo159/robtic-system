import { Schema, model, type Document } from "mongoose";

/**
 * Rolled-up counters per staff member.
 *
 * These are derivable from `stafflogs` and `staffsessions`, but the dashboard and the leaderboard
 * read them on every render — an aggregation over an append-only audit table would grow without
 * bound. Counters are incremented with `$inc` at write time, so the two never drift by more than
 * one failed log write.
 */
export interface IStaffStats extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    discordId?: string;
    /** Accumulated on-duty milliseconds across every closed session. */
    onDutyMs: number;
    sessionCount: number;
    freezes: number;
    jails: number;
    teleports: number;
    inspections: number;
    reportsResolved: number;
    warningsIssued: number;
    notesWritten: number;
    commandsUsed: number;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const staffStatsSchema = new Schema<IStaffStats>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        discordId: { type: String },
        onDutyMs: { type: Number, default: 0 },
        sessionCount: { type: Number, default: 0 },
        freezes: { type: Number, default: 0 },
        jails: { type: Number, default: 0 },
        teleports: { type: Number, default: 0 },
        inspections: { type: Number, default: 0 },
        reportsResolved: { type: Number, default: 0 },
        warningsIssued: { type: Number, default: 0 },
        notesWritten: { type: Number, default: 0 },
        commandsUsed: { type: Number, default: 0 },
        lastLoginAt: { type: Date },
    },
    { timestamps: true }
);

staffStatsSchema.index({ guildId: 1, minecraftUuid: 1 }, { unique: true });
staffStatsSchema.index({ guildId: 1, onDutyMs: -1 });

export const StaffStats = model<IStaffStats>("StaffStats", staffStatsSchema);
