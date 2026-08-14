import { RejoinRolesConfig, type IRejoinRolesConfig } from "@database/models/RejoinRolesConfig";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { config: IRejoinRolesConfig; expiresAt: number }>();

export class RejoinRolesConfigRepository {
    /** Read on every leave and every join, so cached with the usual short TTL. */
    static async getCached(guildId: string): Promise<IRejoinRolesConfig> {
        const hit = cache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.config;

        const config = await RejoinRolesConfig.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as IRejoinRolesConfig;

        cache.set(guildId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
        return config;
    }

    static async addRole(guildId: string, field: "excludedRoleIds" | "staffRoleIds", roleId: string): Promise<IRejoinRolesConfig> {
        return this.update(guildId, { $addToSet: { [field]: roleId } });
    }

    static async removeRole(guildId: string, field: "excludedRoleIds" | "staffRoleIds", roleId: string): Promise<IRejoinRolesConfig> {
        return this.update(guildId, { $pull: { [field]: roleId } });
    }

    /**
     * Sets both windows together, because they are only valid relative to each other — accepting
     * them one at a time would let a guild pass through a state where staff roles outlive ordinary
     * ones, which is the exact thing the split exists to prevent.
     */
    static async setWindows(guildId: string, retentionHours: number, staffRetentionHours: number): Promise<IRejoinRolesConfig> {
        if (staffRetentionHours >= retentionHours) {
            throw new Error("The staff window must be shorter than the member window.");
        }
        return this.update(guildId, { $set: { retentionHours, staffRetentionHours } });
    }

    private static async update(guildId: string, mutation: object): Promise<IRejoinRolesConfig> {
        const config = await RejoinRolesConfig.findOneAndUpdate(
            { guildId },
            mutation,
            { upsert: true, returnDocument: "after" }
        ) as IRejoinRolesConfig;

        cache.delete(guildId);
        return config;
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}

