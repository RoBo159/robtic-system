import { Schema, model, type Document } from "mongoose";
import { locationSchema, type IWorldLocation } from "./shared/location";

/**
 * The chest a Tier II player has linked with `/linkchest` and can open anywhere with `/chest`.
 *
 * One per player per server, so `/linkchest` replaces rather than accumulates — the command has no
 * concept of choosing between several, and letting the collection grow would make `/chest`
 * ambiguous.
 *
 * The contents are *not* stored here. `/chest` opens the real inventory at these coordinates, so
 * the chest stays a normal chest that can be emptied, broken or hoppered like any other.
 */
export interface IMinecraftPortableChest extends Document {
    minecraftUuid: string;
    serverKey: string;
    location: IWorldLocation;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftPortableChestSchema = new Schema<IMinecraftPortableChest>(
    {
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        serverKey: { type: String, required: true, trim: true },
        location: { type: locationSchema, required: true },
    },
    { timestamps: true }
);

minecraftPortableChestSchema.index({ minecraftUuid: 1, serverKey: 1 }, { unique: true });

export const MinecraftPortableChest = model<IMinecraftPortableChest>(
    "MinecraftPortableChest",
    minecraftPortableChestSchema,
);
