import { Schema, model, type Document } from "mongoose";

export interface IStreak extends Document {
    discordId: string;
    guildId: string;
    username: string;
    currentStreak: number;
    bestStreak: number;
    lastIncrement: Date;
    lastMessageAt: Date;
    lastMessageContent: string;
    reminderSent: boolean;
    active: boolean;
    /**
     * Set when the streak dies, to the moment staff can no longer give it back.
     *
     * While it is in the future the member is frozen: qualifying messages are ignored silently, so
     * posting cannot quietly replace a 200-day streak with a 1-day one before anyone has had the
     * chance to restore it. Cleared on a return, and ignored once it passes.
     */
    pendingReturnUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const streakSchema = new Schema<IStreak>(
    {
        discordId: { type: String, required: true, index: true },
        guildId: { type: String, required: true, index: true },
        username: { type: String, required: true },
        currentStreak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        lastIncrement: { type: Date, default: () => new Date(0) },
        lastMessageAt: { type: Date, default: () => new Date(0) },
        lastMessageContent: { type: String, default: "" },
        reminderSent: { type: Boolean, default: false },
        active: { type: Boolean, default: false },
        pendingReturnUntil: { type: Date, default: null },
    },
    { timestamps: true }
);

streakSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
streakSchema.index({ guildId: 1, currentStreak: -1 });
streakSchema.index({ guildId: 1, bestStreak: -1 });

export const Streak = model<IStreak>("Streak", streakSchema);
