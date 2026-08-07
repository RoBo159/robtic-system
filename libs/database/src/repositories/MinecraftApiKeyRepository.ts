import { MinecraftApiKey, type IMinecraftApiKey } from "@database/models/MinecraftApiKey";

export class MinecraftApiKeyRepository {
    /**
     * Resolves a key by its digest. `lastUsedAt` is updated in the same round trip so an
     * authenticated request costs one query rather than two.
     *
     * A revoked key is filtered out by the query itself, so revocation takes effect on the next
     * request without any cache to invalidate.
     */
    static async findActiveByHash(keyHash: string): Promise<IMinecraftApiKey | null> {
        return MinecraftApiKey.findOneAndUpdate(
            { keyHash, revoked: false },
            { $set: { lastUsedAt: new Date() } },
            { returnDocument: "after" }
        );
    }

    static async create(input: {
        guildId: string;
        keyHash: string;
        label: string;
        serverId: string | null;
        scopes: string[];
        createdBy: string;
        rotatedFromLabel?: string;
    }): Promise<IMinecraftApiKey> {
        return MinecraftApiKey.create(input);
    }

    static async listByGuild(guildId: string): Promise<IMinecraftApiKey[]> {
        return MinecraftApiKey.find({ guildId }).sort({ createdAt: -1 });
    }

    static async revoke(guildId: string, label: string): Promise<IMinecraftApiKey | null> {
        return MinecraftApiKey.findOneAndUpdate(
            { guildId, label },
            { $set: { revoked: true, revokedAt: new Date() } },
            { returnDocument: "after" }
        );
    }
}
