import { StaffTier, type IStaffTier } from "@database/models/StaffTier";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { tiers: IStaffTier[]; expiresAt: number }>();

export class StaffTierRepository {
    static async create(
        guildId: string,
        key: string,
        name: string,
        score: number,
        firstRoleId?: string,
    ): Promise<IStaffTier> {
        const tier = await StaffTier.create({
            guildId,
            key,
            name,
            score,
            roleIds: firstRoleId ? [firstRoleId] : [],
        });
        this.invalidate(guildId);
        return tier;
    }

    static async addRole(guildId: string, key: string, roleId: string): Promise<IStaffTier | null> {
        const tier = await StaffTier.findOneAndUpdate(
            { guildId, key },
            { $addToSet: { roleIds: roleId } },
            { returnDocument: "after" }
        );
        this.invalidate(guildId);
        return tier;
    }

    static async removeRole(guildId: string, key: string, roleId: string): Promise<IStaffTier | null> {
        const tier = await StaffTier.findOneAndUpdate(
            { guildId, key },
            { $pull: { roleIds: roleId } },
            { returnDocument: "after" }
        );
        this.invalidate(guildId);
        return tier;
    }

    static async remove(guildId: string, key: string): Promise<boolean> {
        const result = await StaffTier.deleteOne({ guildId, key });
        this.invalidate(guildId);
        return result.deletedCount > 0;
    }

    static async list(guildId: string): Promise<IStaffTier[]> {
        return StaffTier.find({ guildId }).sort({ score: -1 });
    }

    static async get(guildId: string, key: string): Promise<IStaffTier | null> {
        return StaffTier.findOne({ guildId, key });
    }

    /** Hot-path entry point used by access.ts — short-TTL cached so per-interaction permission checks don't cost a Mongo read every time. */
    static async getCached(guildId: string): Promise<IStaffTier[]> {
        const cached = cache.get(guildId);
        if (cached && cached.expiresAt > Date.now()) return cached.tiers;

        const tiers = await this.list(guildId);
        cache.set(guildId, { tiers, expiresAt: Date.now() + CACHE_TTL_MS });
        return tiers;
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
