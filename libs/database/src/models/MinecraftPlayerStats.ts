import { Schema, model, type Document } from "mongoose";

/**
 * Lifetime play statistics, shown by `/profile` in game and `/minecraft profile` on Discord.
 *
 * Network-wide rather than per server: a player's playtime and kill count are theirs, not the
 * survival server's. The game server reports deltas (`+n` playtime, `+1` death) so two servers
 * running at once cannot overwrite each other's totals — every write is an `$inc`.
 *
 * `jailCount` lives here rather than being counted from `MinecraftJail` so the profile stays one
 * cheap read; the jail collection remains the record of individual sentences.
 */
export interface IMinecraftPlayerStats extends Document {
    minecraftUuid: string;
    username: string;
    /** Total time connected, in milliseconds, summed across every server. */
    playtimeMs: number;
    kills: number;
    deaths: number;
    /** Lifetime number of jail sentences served, incremented when a sentence starts. */
    jailCount: number;
    firstJoinAt: Date;
    lastSeenAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftPlayerStatsSchema = new Schema<IMinecraftPlayerStats>(
    {
        minecraftUuid: { type: String, required: true, unique: true, lowercase: true, trim: true },
        username: { type: String, required: true, trim: true },
        playtimeMs: { type: Number, default: 0, min: 0 },
        kills: { type: Number, default: 0, min: 0 },
        deaths: { type: Number, default: 0, min: 0 },
        jailCount: { type: Number, default: 0, min: 0 },
        firstJoinAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

minecraftPlayerStatsSchema.index({ playtimeMs: -1 });

export const MinecraftPlayerStats = model<IMinecraftPlayerStats>(
    "MinecraftPlayerStats",
    minecraftPlayerStatsSchema,
);
