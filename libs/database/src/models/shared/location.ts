import { Schema } from "mongoose";

/**
 * A point in a Minecraft world.
 *
 * Defined once and embedded by every model that stores a destination — spawn, homes, locked chests
 * and the portable chest. They all need exactly these seven fields, and a second copy of them is
 * how one of them quietly ends up without `yaw` and teleports players facing the wrong way.
 */
export interface IWorldLocation {
    world: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}

/**
 * Embedded rather than referenced, and `_id: false` because these are values, not entities: two
 * homes at the same coordinates are the same place, and giving each an id implies otherwise.
 */
export const locationSchema = new Schema<IWorldLocation>(
    {
        world: { type: String, required: true, trim: true },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        z: { type: Number, required: true },
        yaw: { type: Number, default: 0 },
        pitch: { type: Number, default: 0 },
    },
    { _id: false }
);
