import { Schema, model, type Document } from "mongoose";

/**
 * An accepted, mutual friendship between two Minecraft accounts.
 *
 * <h2>One row, not two</h2>
 *
 * Friendship is symmetric, so it is stored once with the two UUIDs held in sorted order as
 * `uuidLow`/`uuidHigh`. That is what lets a unique index actually enforce "these two are friends
 * at most once" — with a row per direction, nothing stops A→B existing without B→A, and every
 * read has to reconcile the two halves.
 *
 * Use {@link friendshipPair} to build the key; never assign the fields by hand.
 */
export interface IMinecraftFriendship extends Document {
    uuidLow: string;
    uuidHigh: string;
    createdAt: Date;
    updatedAt: Date;
}

/** Normalises two UUIDs into the sorted pair this collection is keyed by. */
export function friendshipPair(a: string, b: string): { uuidLow: string; uuidHigh: string } {
    const [low, high] = [a.toLowerCase(), b.toLowerCase()].sort();
    return { uuidLow: low!, uuidHigh: high! };
}

const minecraftFriendshipSchema = new Schema<IMinecraftFriendship>(
    {
        uuidLow: { type: String, required: true, lowercase: true, trim: true },
        uuidHigh: { type: String, required: true, lowercase: true, trim: true },
    },
    { timestamps: true }
);

minecraftFriendshipSchema.index({ uuidLow: 1, uuidHigh: 1 }, { unique: true });
// Both halves are indexed separately because "who are X's friends?" matches on either column.
minecraftFriendshipSchema.index({ uuidHigh: 1 });

export const MinecraftFriendship = model<IMinecraftFriendship>("MinecraftFriendship", minecraftFriendshipSchema);
