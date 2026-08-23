import { Schema, model, type Document } from "mongoose";
import { locationSchema, type IWorldLocation } from "./shared/location";

/**
 * A chest a premium player has locked against everyone else.
 *
 * Keyed by *location*, not by owner: the question the protection listener asks thousands of times
 * is "is this block locked, and by whom?", so the unique index is on the block coordinates. Owner
 * lookups ("how many have I locked?") are the rarer direction and get their own index.
 *
 * How many a player may lock comes from their premium tier at the time of locking, not from
 * anything stored here — see the chest service.
 */
export interface IMinecraftLockedChest extends Document {
    minecraftUuid: string;
    ownerUsername: string;
    serverKey: string;
    location: IWorldLocation;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftLockedChestSchema = new Schema<IMinecraftLockedChest>(
    {
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        ownerUsername: { type: String, required: true, trim: true },
        serverKey: { type: String, required: true, trim: true },
        location: { type: locationSchema, required: true },
    },
    { timestamps: true }
);

// One lock per block. Two players cannot own the same chest, and re-locking is idempotent.
//
// Coordinates are matched exactly, which is why the service floors them to block coordinates
// before writing: a lock stored at x=10.5 would never match the block lookup at x=10.
minecraftLockedChestSchema.index(
    { serverKey: 1, "location.world": 1, "location.x": 1, "location.y": 1, "location.z": 1 },
    { unique: true },
);
minecraftLockedChestSchema.index({ minecraftUuid: 1, serverKey: 1 });

export const MinecraftLockedChest = model<IMinecraftLockedChest>(
    "MinecraftLockedChest",
    minecraftLockedChestSchema,
);
