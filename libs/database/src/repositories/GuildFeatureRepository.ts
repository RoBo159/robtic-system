import { GuildFeature, type IGuildFeature } from "@database/models/GuildFeature";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { overrides: Map<string, boolean>; expiresAt: number }>();

/**
 * Per-guild feature toggles.
 *
 * Cached with the same short TTL as StaffTierRepository, and for a stronger reason: the activation
 * gate runs on every command *and* inside every message-driven feature listener, so an uncached
 * read here would add a Mongo round-trip per message across streak, combo, xp and message-stats.
 */
export class GuildFeatureRepository {
    /** Explicit overrides only. A key absent from the map has no row and falls back to the manifest default. */
    static async getOverrides(guildId: string): Promise<Map<string, boolean>> {
        const cached = cache.get(guildId);
        if (cached && cached.expiresAt > Date.now()) return cached.overrides;

        const rows = await GuildFeature.find({ guildId });
        const overrides = new Map(rows.map(row => [row.key, row.enabled]));
        cache.set(guildId, { overrides, expiresAt: Date.now() + CACHE_TTL_MS });
        return overrides;
    }

    static async set(guildId: string, key: string, enabled: boolean, updatedBy: string): Promise<IGuildFeature> {
        const row = await GuildFeature.findOneAndUpdate(
            { guildId, key },
            { $set: { enabled, updatedBy } },
            { upsert: true, returnDocument: "after" }
        ) as IGuildFeature;

        this.invalidate(guildId);
        return row;
    }

    static async list(guildId: string): Promise<IGuildFeature[]> {
        return GuildFeature.find({ guildId });
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
