import { Schema, model, type Document } from "mongoose";
import { locationSchema, type IWorldLocation } from "./shared/location";

/**
 * The global spawn point, one per game server.
 *
 * Scoped by `serverKey` rather than being network-wide because the coordinates name a world on a
 * specific server: a spawn set on survival is meaningless on skyblock, and sharing one row between
 * them would teleport players into whatever happens to be at those coordinates.
 *
 * Set with `/setspawn` and read by `/spawn`. The plugin caches it at boot and refreshes only when
 * `/setspawn` runs, so `/spawn` never costs a request.
 */
export interface IMinecraftSpawn extends Document {
    guildId: string;
    serverKey: string;
    location: IWorldLocation;
    /** Minecraft UUID of whoever last ran `/setspawn`, for the audit trail. */
    updatedByUuid: string;
    updatedByUsername: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftSpawnSchema = new Schema<IMinecraftSpawn>(
    {
        guildId: { type: String, required: true, index: true },
        serverKey: { type: String, required: true, trim: true },
        location: { type: locationSchema, required: true },
        updatedByUuid: { type: String, required: true, lowercase: true, trim: true },
        updatedByUsername: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

minecraftSpawnSchema.index({ guildId: 1, serverKey: 1 }, { unique: true });

export const MinecraftSpawn = model<IMinecraftSpawn>("MinecraftSpawn", minecraftSpawnSchema);
