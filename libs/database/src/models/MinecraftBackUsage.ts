import { Schema, model, type Document } from "mongoose";

/**
 * A player's `/back` budget for the current window.
 *
 * <h2>A fixed window, stored as a start time and a count</h2>
 *
 * Storing "remaining" alone would need a scheduled job to reset it for every player, most of whom
 * are offline. Storing when the window opened and how much has been spent in it means the reset is
 * computed at read time and costs nothing: once `windowStartedAt` is older than the window length,
 * the row is treated as a fresh one.
 *
 * The *limit* is not stored — it comes from the player's premium tier when the budget is read, so
 * an upgrade takes effect on the next `/back` rather than at the next window.
 *
 * The plugin caches the remaining count and the reset time and decrements locally, so a `/back`
 * with budget left never calls the API.
 */
export interface IMinecraftBackUsage extends Document {
    minecraftUuid: string;
    /** Uses spent since `windowStartedAt`. */
    used: number;
    windowStartedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftBackUsageSchema = new Schema<IMinecraftBackUsage>(
    {
        minecraftUuid: { type: String, required: true, unique: true, lowercase: true, trim: true },
        used: { type: Number, default: 0, min: 0 },
        windowStartedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export const MinecraftBackUsage = model<IMinecraftBackUsage>("MinecraftBackUsage", minecraftBackUsageSchema);
