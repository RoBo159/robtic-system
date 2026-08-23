import { Schema, model, type Document } from "mongoose";

/**
 * One player's **robs** — the Minecraft currency.
 *
 * <h2>Why this is keyed by UUID and not by Discord id</h2>
 *
 * Robs are earned and spent entirely inside Minecraft, so the account that holds them is a
 * Minecraft account. Keying by UUID is what lets an unlinked player run `/bal`, mine, sell and be
 * paid without ever touching Discord — and it removes the `MinecraftLink` lookup that every single
 * economy call used to perform just to turn a UUID into a Discord id.
 *
 * `discordId` is denormalised here purely so a linked player's robs can be shown on Discord without
 * a second query. It is a convenience copy, never the key: nothing resolves a balance through it,
 * and a null value is normal rather than an error.
 *
 * <h2>Robs are not coins</h2>
 *
 * {@link Coin} is a separate, Discord-only currency keyed by Discord id. The two never convert into
 * one another and no code should ever read one to compute the other. They were a single balance
 * once; splitting them is the whole point of this collection existing.
 */
export interface IRob extends Document {
    minecraftUuid: string;
    username: string;
    robs: number;
    /** Convenience copy of the linked Discord id, or null when the player has not linked. */
    discordId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const robSchema = new Schema<IRob>(
    {
        minecraftUuid: { type: String, required: true, unique: true, lowercase: true, trim: true },
        username: { type: String, required: true, trim: true },
        robs: { type: Number, default: 0, min: 0 },
        discordId: { type: String, default: null, index: true },
    },
    { timestamps: true }
);

// Backs the leaderboard and the rank lookup.
robSchema.index({ robs: -1 });

export const Rob = model<IRob>("Rob", robSchema);
