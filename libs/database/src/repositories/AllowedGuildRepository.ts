import { AllowedGuild, type IAllowedGuild } from "@database/models/AllowedGuild";
import { SEED_ALLOWED_GUILD_IDS } from "@constants";

/**
 * The guild whitelist.
 *
 * This used to be `MainGuild` + `TestGuild` read out of the environment at import time, which meant
 * authorising a new server was a redeploy. It is data now, cached in memory because the guard that
 * reads it runs on every `guildCreate` and once per guild at startup.
 */
export class AllowedGuildRepository {
    private static cache: Set<string> | null = null;
    private static loadingPromise: Promise<Set<string>> | null = null;

    private static async getCache(): Promise<Set<string>> {
        if (this.cache) return this.cache;
        if (!this.loadingPromise) {
            this.loadingPromise = AllowedGuild.find().then(docs => {
                this.cache = new Set(docs.map(d => d.guildId));
                return this.cache;
            });
        }
        return this.loadingPromise;
    }

    /**
     * Warms the cache at boot and inserts the seed ids if they are missing.
     *
     * The seed is an upsert per id rather than a "collection is empty" check: that way an id added
     * to the seed list later still lands, and an id an operator deliberately removed stays removed
     * only until the next boot — which is why the seed list is for permanent, known-good servers
     * and `/addserver` is for everything else.
     */
    static async preload(): Promise<void> {
        if (SEED_ALLOWED_GUILD_IDS.length > 0) {
            await AllowedGuild.bulkWrite(
                SEED_ALLOWED_GUILD_IDS.map(guildId => ({
                    updateOne: {
                        filter: { guildId },
                        update: { $setOnInsert: { guildId, addedBy: "system" } },
                        upsert: true,
                    },
                })),
            );
        }

        this.cache = null;
        this.loadingPromise = null;
        await this.getCache();
    }

    static async isAllowed(guildId: string): Promise<boolean> {
        const cache = await this.getCache();
        return cache.has(guildId);
    }

    /**
     * Synchronous variant for callers that can't await. Reads only the already-warmed cache;
     * `preload()` runs at boot. Fails closed — an unwarmed cache reports "not allowed".
     */
    static isAllowedCached(guildId: string): boolean {
        return this.cache?.has(guildId) ?? false;
    }

    /** Returns false when the guild was already on the list. */
    static async add(guildId: string, addedBy: string, name?: string): Promise<boolean> {
        const existing = await AllowedGuild.findOne({ guildId });
        if (existing) {
            if (name && existing.name !== name) {
                existing.name = name;
                await existing.save();
            }
            (await this.getCache()).add(guildId);
            return false;
        }

        await AllowedGuild.create({ guildId, addedBy, name });
        (await this.getCache()).add(guildId);
        return true;
    }

    /** Returns false when the guild wasn't on the list to begin with. */
    static async remove(guildId: string): Promise<boolean> {
        const result = await AllowedGuild.deleteOne({ guildId });
        (await this.getCache()).delete(guildId);
        return result.deletedCount > 0;
    }

    static async list(): Promise<IAllowedGuild[]> {
        return AllowedGuild.find().sort({ createdAt: 1 });
    }
}
