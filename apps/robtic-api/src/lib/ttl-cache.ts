/**
 * An in-process TTL cache.
 *
 * Deliberately not shared across replicas: everything cached here is derived config that is also
 * invalidated explicitly on edit, so a second replica holding a copy a few seconds out of date is
 * harmless. Balances are never stored here — a stale balance can be spent twice.
 */
export class TtlCache<T> {
    private readonly entries = new Map<string, { value: T; expiresAt: number }>();

    constructor(private readonly ttlMs: number) {}

    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.value;
    }

    set(key: string, value: T): void {
        this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    }

    /** Reads through to `load` on a miss. Concurrent misses may both load; the work is idempotent. */
    async resolve(key: string, load: () => Promise<T>): Promise<T> {
        const cached = this.get(key);
        if (cached !== undefined) return cached;

        const value = await load();
        this.set(key, value);
        return value;
    }

    invalidate(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }
}
