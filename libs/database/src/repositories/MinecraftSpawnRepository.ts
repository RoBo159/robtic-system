import { MinecraftSpawn, type IMinecraftSpawn } from "@database/models/MinecraftSpawn";
import type { IWorldLocation } from "@database/models/shared/location";

/** The global spawn point, one row per game server. */
export class MinecraftSpawnRepository {
    static async get(guildId: string, serverKey: string): Promise<IMinecraftSpawn | null> {
        return MinecraftSpawn.findOne({ guildId, serverKey });
    }

    /** `/setspawn` — an upsert, because a server has exactly one spawn and moving it replaces it. */
    static async set(input: {
        guildId: string;
        serverKey: string;
        location: IWorldLocation;
        updatedByUuid: string;
        updatedByUsername: string;
    }): Promise<IMinecraftSpawn> {
        return MinecraftSpawn.findOneAndUpdate(
            { guildId: input.guildId, serverKey: input.serverKey },
            {
                $set: {
                    location: input.location,
                    updatedByUuid: input.updatedByUuid.toLowerCase(),
                    updatedByUsername: input.updatedByUsername,
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftSpawn>;
    }
}
