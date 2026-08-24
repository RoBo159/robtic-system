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

    /**
     * Time spent in a game server's AFK world, in milliseconds, summed across every server.
     *
     * Written once per AFK session, when the session ends — the game server holds the session in
     * memory and settles it on the way out, so a player standing still for six hours costs one
     * write rather than six hours of them.
     */
    afkTotalMs: number;
    /** The same figure for {@link afkTodayDate} only, reset by the first write of a new day. */
    afkTodayMs: number;
    /**
     * The UTC day `afkTodayMs` belongs to, as `yyyy-MM-dd`.
     *
     * Stored beside the total rather than inferred from `updatedAt`, because "today" has to survive
     * being read by a server in a different timezone and has to be answerable without a scheduled
     * job that resets every row at midnight.
     */
    afkTodayDate: string;
    /** Lifetime robs earned by being AFK, kept apart from the balance so the source stays visible. */
    afkRobs: number;

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

        afkTotalMs: { type: Number, default: 0, min: 0 },
        afkTodayMs: { type: Number, default: 0, min: 0 },
        afkTodayDate: { type: String, default: "" },
        afkRobs: { type: Number, default: 0, min: 0 },

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
