import { Schema, model, type Document } from "mongoose";

/**
 * A **read-only** copy of a player's survival inventory, for the lobby's preview menu.
 *
 * <h2>This is not inventory management</h2>
 *
 * Multiverse-Inventories owns saving and restoring inventories across worlds, and nothing here
 * changes that — this row is never restored to a player, never written back into a world, and
 * never read by anything but the preview GUI. It exists because the lobby has to *show* the
 * survival inventory while the player is standing in a world where they are not holding it.
 *
 * It is captured as the player leaves a survival world, which is the last moment the contents are
 * both current and in memory. If a capture is missed the preview simply shows the previous one,
 * marked with its age — a stale preview is obvious and harmless, whereas restoring from a stale
 * copy would not be, which is exactly why restoring is left to the plugin that owns it.
 */
export interface IMinecraftInventorySnapshot extends Document {
    minecraftUuid: string;
    serverKey: string;
    /** The world the snapshot was taken in, so the preview can say which inventory it is showing. */
    world: string;
    /** Bukkit's own Base64 serialisation of the main inventory. Never parsed outside the plugin. */
    contents: string;
    armor: string;
    offhand: string;
    capturedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftInventorySnapshotSchema = new Schema<IMinecraftInventorySnapshot>(
    {
        minecraftUuid: { type: String, required: true, lowercase: true, trim: true },
        serverKey: { type: String, required: true, trim: true },
        world: { type: String, required: true, trim: true },
        contents: { type: String, default: "" },
        armor: { type: String, default: "" },
        offhand: { type: String, default: "" },
        capturedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// One snapshot per player per server: the preview shows "your survival inventory", singular, and
// keeping a history would grow without bound for something nobody can look back through.
minecraftInventorySnapshotSchema.index({ minecraftUuid: 1, serverKey: 1 }, { unique: true });

export const MinecraftInventorySnapshot = model<IMinecraftInventorySnapshot>(
    "MinecraftInventorySnapshot",
    minecraftInventorySnapshotSchema,
);
