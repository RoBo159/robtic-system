import { MinecraftHome, type IMinecraftHome } from "@database/models/MinecraftHome";
import type { IWorldLocation } from "@database/models/shared/location";

/**
 * Player homes.
 *
 * Nothing here enforces a limit — that is the home service's job, because the limit depends on a
 * premium tier this layer knows nothing about. Keeping the check out of the repository is what
 * stops it being applied inconsistently by two different callers.
 */
export class MinecraftHomeRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    private static name(value: string): string {
        return value.toLowerCase().trim();
    }

    static async list(uuid: string, serverKey: string): Promise<IMinecraftHome[]> {
        return MinecraftHome.find({ minecraftUuid: this.key(uuid), serverKey }).sort({ name: 1 });
    }

    static async get(uuid: string, serverKey: string, name: string): Promise<IMinecraftHome | null> {
        return MinecraftHome.findOne({ minecraftUuid: this.key(uuid), serverKey, name: this.name(name) });
    }

    static async count(uuid: string, serverKey: string): Promise<number> {
        return MinecraftHome.countDocuments({ minecraftUuid: this.key(uuid), serverKey });
    }

    /** Creates or moves a home. `/sethome` on an existing name replaces its location. */
    static async put(input: {
        uuid: string;
        serverKey: string;
        name: string;
        location: IWorldLocation;
    }): Promise<IMinecraftHome> {
        return MinecraftHome.findOneAndUpdate(
            { minecraftUuid: this.key(input.uuid), serverKey: input.serverKey, name: this.name(input.name) },
            { $set: { location: input.location } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftHome>;
    }

    /** Returns false when there was no such home, so the caller can say so rather than claim success. */
    static async remove(uuid: string, serverKey: string, name: string): Promise<boolean> {
        const result = await MinecraftHome.deleteOne({
            minecraftUuid: this.key(uuid),
            serverKey,
            name: this.name(name),
        });
        return result.deletedCount > 0;
    }

    /**
     * Renames a home in place.
     *
     * Returns null when the source does not exist. A collision with an existing name surfaces as a
     * duplicate-key error from the unique index rather than being pre-checked, so two renames
     * racing cannot both pass a check and then both write.
     */
    static async rename(
        uuid: string,
        serverKey: string,
        from: string,
        to: string,
    ): Promise<IMinecraftHome | null> {
        return MinecraftHome.findOneAndUpdate(
            { minecraftUuid: this.key(uuid), serverKey, name: this.name(from) },
            { $set: { name: this.name(to) } },
            { returnDocument: "after" }
        );
    }
}
