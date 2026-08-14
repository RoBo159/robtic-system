import { SuperUser, type ISuperUser } from "@database/models/SuperUser";

export class SuperUserRepository {
    private static cache: Set<string> | null = null;
    private static loadingPromise: Promise<Set<string>> | null = null;

    private static async getCache(): Promise<Set<string>> {
        if (this.cache) return this.cache;
        if (!this.loadingPromise) {
            this.loadingPromise = SuperUser.find().then(docs => {
                this.cache = new Set(docs.map(d => d.userId));
                return this.cache;
            });
        }
        return this.loadingPromise;
    }

    /** In-memory check, so this runs safely on every command without hitting the DB each time. */
    static async isWhitelisted(userId: string): Promise<boolean> {
        const cache = await this.getCache();
        return cache.has(userId);
    }

    /**
     * Synchronous variant for callers that can't await (e.g. isGuildOperator, used inside sync guards).
     * Reads only the already-warmed cache — `preload()` runs at boot, and if it somehow hasn't yet,
     * this returns false and the caller falls through to the normal permission checks. Fail-closed:
     * it can under-grant for a moment, never over-grant.
     */
    static isWhitelistedCached(userId: string): boolean {
        return this.cache?.has(userId) ?? false;
    }

    /** Warm the cache at boot so the first command doesn't pay a DB round-trip. */
    static async preload(): Promise<void> {
        await this.getCache();
    }

    static async add(userId: string, addedBy: string): Promise<ISuperUser> {
        const doc = await SuperUser.findOneAndUpdate(
            { userId },
            { $set: { addedBy } },
            { upsert: true, returnDocument: "after" }
        ) as ISuperUser;

        const cache = await this.getCache();
        cache.add(userId);

        return doc;
    }

    static async remove(userId: string): Promise<void> {
        await SuperUser.deleteOne({ userId });

        const cache = await this.getCache();
        cache.delete(userId);
    }

    static async list(): Promise<ISuperUser[]> {
        return SuperUser.find();
    }
}
