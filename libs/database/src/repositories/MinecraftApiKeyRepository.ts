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

    /**
     * Issues a key, reclaiming the label from a revoked one if necessary.
     *
     * The uniqueness index is `{guildId, label}` and does not include `revoked`, so a revoked row
     * goes on occupying its label forever. That contradicted the only workflow the admin command
     * offers — it refuses a duplicate label with "revoke it first, or pick another label", and
     * revoking did not actually free it, so following that instruction produced an E11000 from the
     * driver and left the operator unable to issue a key under the name they had just retired.
     *
     * The dead row is therefore dropped here. It holds no credential worth keeping: only a digest
     * that can no longer authenticate, and `rotatedFromLabel` already records the succession.
     */
    static async create(input: {
        guildId: string;
        keyHash: string;
        label: string;
        serverId: string | null;
        scopes: string[];
        createdBy: string;
        rotatedFromLabel?: string;
    }): Promise<IMinecraftApiKey> {
        await MinecraftApiKey.deleteMany({ guildId: input.guildId, label: input.label, revoked: true });
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
