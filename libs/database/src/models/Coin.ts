import { Schema, model, type Document } from "mongoose";

/**
 * One member's coin balance — **global**, not per guild.
 *
 * Coins are the Minecraft wallet, and a player who mines on the network should have the same money
 * whichever Discord server they happen to be in. The balance is therefore keyed by Discord id
 * alone. `MinecraftLink` stays per-guild, so resolving a UUID to a Discord id still needs a guild;
 * the balance that resolution lands on does not.
 *
 * The per-guild rows this replaced live on in `LegacyCoin`, readable but no longer spendable.
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
