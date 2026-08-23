import { MinecraftPlayerPrefs, type IMinecraftPlayerPrefs } from "@database/models/MinecraftPlayerPrefs";

/** The fields a player may change about themselves. Everything else on the document is derived. */
export type PlayerPrefsChanges = Partial<Pick<
    IMinecraftPlayerPrefs,
    "friendTpAutoAccept" | "joinMessage" | "leaveMessage" | "particle" | "playersVisible" | "privateProfile"
>>;

/** Friend-teleport handling and the premium cosmetics, one document per player. */
export class MinecraftPlayerPrefsRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async get(uuid: string): Promise<IMinecraftPlayerPrefs | null> {
        return MinecraftPlayerPrefs.findOne({ minecraftUuid: this.key(uuid) });
    }

    static async getMany(uuids: string[]): Promise<IMinecraftPlayerPrefs[]> {
        if (uuids.length === 0) return [];
        return MinecraftPlayerPrefs.find({ minecraftUuid: { $in: uuids.map(uuid => this.key(uuid)) } });
    }

    /**
     * Applies a partial update.
     *
     * `null` is a meaningful value here — it is how `/particle off` and clearing a join message are
     * expressed — so only keys actually present in `changes` are written. An undefined key means
     * "leave it alone", which is why this cannot simply spread the object.
     */
    static async update(
        uuid: string,
        changes: PlayerPrefsChanges,
    ): Promise<IMinecraftPlayerPrefs> {
        const set: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(changes)) {
            if (value !== undefined) set[key] = value;
        }

        return MinecraftPlayerPrefs.findOneAndUpdate(
            { minecraftUuid: this.key(uuid) },
            { $set: set },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftPlayerPrefs>;
    }
}
