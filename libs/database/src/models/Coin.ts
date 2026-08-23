import { Schema, model, type Document } from "mongoose";

/**
 * One member's coin balance — **global**, not per guild.
 *
 * <h2>Coins are Discord-only</h2>
 *
 * Coins were once the Minecraft wallet too. They are not any more: the Minecraft currency is
 * {@link Rob}, keyed by Minecraft UUID and held in its own collection. The two never convert into
 * one another, and nothing on the game server can read or move a coin balance.
 *
 * Keyed by Discord id alone, so a member has one balance whichever server they are in. The
 * per-guild rows this replaced live on in `LegacyCoin`, readable but no longer spendable.
 */
export interface ICoin extends Document {
    discordId: string;
    username: string;
    coins: number;
    createdAt: Date;
    updatedAt: Date;
}

const coinSchema = new Schema<ICoin>(
    {
        discordId: { type: String, required: true, unique: true },
        username: { type: String, required: true },
        coins: { type: Number, default: 0 },
    },
    { timestamps: true }
);

coinSchema.index({ coins: -1 });

export const Coin = model<ICoin>("Coin", coinSchema);
