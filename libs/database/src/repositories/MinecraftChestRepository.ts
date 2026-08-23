import { MinecraftLockedChest, type IMinecraftLockedChest } from "@database/models/MinecraftLockedChest";
import { MinecraftPortableChest, type IMinecraftPortableChest } from "@database/models/MinecraftPortableChest";
import type { IWorldLocation } from "@database/models/shared/location";

/**
 * Locked chests and the Tier II portable chest.
 *
 * Coordinates are floored to block coordinates on the way in. The unique index matches exactly, so
 * a lock written from a player's standing position (x = 10.62) would never be found by the block
 * lookup at x = 10 — one place to normalise it is the only way that stays consistent.
 */
export class MinecraftChestRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    /** Block coordinates, with the facing kept for the portable chest's teleport-free open. */
    private static block(location: IWorldLocation): IWorldLocation {
        return {
            world: location.world,
            x: Math.floor(location.x),
            y: Math.floor(location.y),
            z: Math.floor(location.z),
            yaw: location.yaw,
            pitch: location.pitch,
        };
    }

    // ─── Locked chests ────────────────────────────────────────────────────────────────────────

    /** Who owns the lock on this block, if anyone. The protection listener's only question. */
    static async lockAt(serverKey: string, location: IWorldLocation): Promise<IMinecraftLockedChest | null> {
        const at = this.block(location);
        return MinecraftLockedChest.findOne({
            serverKey,
            "location.world": at.world,
            "location.x": at.x,
            "location.y": at.y,
            "location.z": at.z,
        });
    }

    static async listLocks(uuid: string, serverKey: string): Promise<IMinecraftLockedChest[]> {
        return MinecraftLockedChest.find({ minecraftUuid: this.key(uuid), serverKey }).sort({ createdAt: 1 });
    }

    static async countLocks(uuid: string, serverKey: string): Promise<number> {
        return MinecraftLockedChest.countDocuments({ minecraftUuid: this.key(uuid), serverKey });
    }

    static async lock(input: {
        uuid: string;
        ownerUsername: string;
        serverKey: string;
        location: IWorldLocation;
    }): Promise<IMinecraftLockedChest> {
        const at = this.block(input.location);
        return MinecraftLockedChest.findOneAndUpdate(
            {
                serverKey: input.serverKey,
                "location.world": at.world,
                "location.x": at.x,
                "location.y": at.y,
                "location.z": at.z,
            },
            {
                $setOnInsert: {
                    minecraftUuid: this.key(input.uuid),
                    ownerUsername: input.ownerUsername,
                    serverKey: input.serverKey,
                    location: at,
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftLockedChest>;
    }

    static async unlock(serverKey: string, location: IWorldLocation): Promise<boolean> {
        const at = this.block(location);
        const result = await MinecraftLockedChest.deleteOne({
            serverKey,
            "location.world": at.world,
            "location.x": at.x,
            "location.y": at.y,
            "location.z": at.z,
        });
        return result.deletedCount > 0;
    }

    // ─── Portable chest ───────────────────────────────────────────────────────────────────────

    static async portable(uuid: string, serverKey: string): Promise<IMinecraftPortableChest | null> {
        return MinecraftPortableChest.findOne({ minecraftUuid: this.key(uuid), serverKey });
    }

    /** `/linkchest` replaces whatever was linked before — there is only ever one. */
    static async linkPortable(input: {
        uuid: string;
        serverKey: string;
        location: IWorldLocation;
    }): Promise<IMinecraftPortableChest> {
        return MinecraftPortableChest.findOneAndUpdate(
            { minecraftUuid: this.key(input.uuid), serverKey: input.serverKey },
            { $set: { location: this.block(input.location) } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftPortableChest>;
    }

    static async unlinkPortable(uuid: string, serverKey: string): Promise<boolean> {
        const result = await MinecraftPortableChest.deleteOne({ minecraftUuid: this.key(uuid), serverKey });
        return result.deletedCount > 0;
    }
}
