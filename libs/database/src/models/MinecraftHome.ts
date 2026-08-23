import { Schema, model, type Document } from "mongoose";
import { locationSchema, type IWorldLocation } from "./shared/location";

/** The name given to a home created by a bare `/sethome`. */
export const DEFAULT_HOME_NAME = "home";

/**
 * One player home.
 *
 * Keyed by Minecraft UUID, like robs and for the same reason: a home is a Minecraft thing and must
 * work for a player who has never linked Discord. Scoped by `serverKey` because the coordinates
 * belong to a world on one server.
 *
 * How many a player may have is *not* stored here — it comes from their premium tier at the moment
 * they run `/sethome`. Storing the limit on the row would freeze it at creation time, so a player
 * who lost premium would keep the extra slots.
 *
 * Coordinates never leave the game server: the Discord profile reports a count and a limit, never
 * a location.
 */
export interface IMinecraftHome extends Document {
    minecraftUuid: string;
    serverKey: string;
    /** Lowercase, unique per player per server. `home` is the default created by a bare /sethome. */
    name: string;
    location: IWorldLocation;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftHomeSchema = new Schema<IMinecraftHome>(
    {
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        serverKey: { type: String, required: true, trim: true },
        name: { type: String, required: true, lowercase: true, trim: true, maxlength: 32 },
        location: { type: locationSchema, required: true },
    },
    { timestamps: true }
);

// One name per player per server. The unique index is what makes `/sethome <name>` an upsert
// rather than a duplicate, and what stops a rename colliding with an existing home.
minecraftHomeSchema.index({ minecraftUuid: 1, serverKey: 1, name: 1 }, { unique: true });
minecraftHomeSchema.index({ minecraftUuid: 1, serverKey: 1 });

export const MinecraftHome = model<IMinecraftHome>("MinecraftHome", minecraftHomeSchema);
