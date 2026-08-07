import { Schema, model, type Document } from "mongoose";

/** A world position, stored flat so a world rename is a single-field migration. */
export interface IWorldLocation {
    world: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}

/**
 * Everything staff mode has to give back when it ends.
 *
 * The row is written **before** the plugin clears an inventory and deleted only once a restore is
 * confirmed, which is what makes the guarantee hold across a disconnect, a plugin reload and a
 * server crash alike: whichever of those happened, the backup is still here on the next join.
 *
 * The item blobs are Bukkit's own Base64 serialisation. Nothing outside the plugin parses them,
 * so the API stays free of any Minecraft-version coupling.
 */
export interface IStaffBackup extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    inventory: string;
    armor: string;
    offhand: string;
    enderChest?: string;
    xpLevel: number;
    xpProgress: number;
    food: number;
    health: number;
    heldSlot: number;
    location: IWorldLocation;
    /** LuckPerms group to return the player to. */
    baseGroup: string;
    createdAt: Date;
    updatedAt: Date;
}

const worldLocationSchema = new Schema<IWorldLocation>(
    {
        world: { type: String, required: true },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        z: { type: Number, required: true },
        yaw: { type: Number, default: 0 },
        pitch: { type: Number, default: 0 },
    },
    { _id: false }
);

const staffBackupSchema = new Schema<IStaffBackup>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverId: { type: String, required: true, trim: true },
        inventory: { type: String, required: true },
        armor: { type: String, required: true },
        offhand: { type: String, required: true },
        enderChest: { type: String },
        xpLevel: { type: Number, default: 0 },
        xpProgress: { type: Number, default: 0 },
        food: { type: Number, default: 20 },
        health: { type: Number, default: 20 },
        heldSlot: { type: Number, default: 0 },
        location: { type: worldLocationSchema, required: true },
        baseGroup: { type: String, default: "staff" },
    },
    { timestamps: true }
);

// One outstanding backup per player per server: a second /admin cannot overwrite the first.
staffBackupSchema.index({ guildId: 1, minecraftUuid: 1, serverId: 1 }, { unique: true });

export const StaffBackup = model<IStaffBackup>("StaffBackup", staffBackupSchema);
