import {
    MinecraftInventorySnapshot,
    type IMinecraftInventorySnapshot,
} from "@database/models/MinecraftInventorySnapshot";

/** The lobby's read-only survival inventory preview. Never restored — see the model. */
export class MinecraftInventorySnapshotRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async get(uuid: string, serverKey: string): Promise<IMinecraftInventorySnapshot | null> {
        return MinecraftInventorySnapshot.findOne({ minecraftUuid: this.key(uuid), serverKey });
    }

    /** Replaces the previous capture: only the latest is ever shown. */
    static async put(input: {
        uuid: string;
        serverKey: string;
        world: string;
        contents: string;
        armor: string;
        offhand: string;
    }): Promise<IMinecraftInventorySnapshot> {
        return MinecraftInventorySnapshot.findOneAndUpdate(
            { minecraftUuid: this.key(input.uuid), serverKey: input.serverKey },
            {
                $set: {
                    world: input.world,
                    contents: input.contents,
                    armor: input.armor,
                    offhand: input.offhand,
                    capturedAt: new Date(),
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftInventorySnapshot>;
    }
}
