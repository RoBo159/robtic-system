import { MinecraftBackUsage, type IMinecraftBackUsage } from "@database/models/MinecraftBackUsage";

/** A `/back` budget: how many uses are left in the current window, and when it resets. */
export interface BackBudget {
    remaining: number;
    limit: number;
    resetAt: Date;
}

/**
 * The `/back` budget, as a fixed window.
 *
 * The window is never reset by a scheduled job. `windowStartedAt` is compared against the window
 * length at read time, so a row whose window has elapsed is treated as empty and rewritten on the
 * next spend — which means an offline player costs nothing to keep current.
 */
export class MinecraftBackUsageRepository {
    private static key(uuid: string): string {
        return uuid.toLowerCase();
    }

    static async get(uuid: string): Promise<IMinecraftBackUsage | null> {
        return MinecraftBackUsage.findOne({ minecraftUuid: this.key(uuid) });
    }

    /**
     * Spends one use if the budget allows, atomically.
     *
     * Returns null when the budget is exhausted. The two branches are separate updates rather than
     * a read followed by a write: the first opens a new window when the old one has elapsed, the
     * second increments inside a live window and matches on `used < limit`, so two concurrent
     * `/back` commands cannot both pass the same check.
     */
    static async trySpend(uuid: string, limit: number, windowMs: number): Promise<BackBudget | null> {
        if (limit <= 0) return null;

        const key = this.key(uuid);
        const now = new Date();
        const windowFloor = new Date(now.getTime() - windowMs);

        // A window that has elapsed (or a player with no row) starts fresh at one use spent.
        const restarted = await MinecraftBackUsage.findOneAndUpdate(
            { minecraftUuid: key, windowStartedAt: { $lte: windowFloor } },
            { $set: { used: 1, windowStartedAt: now } },
            { returnDocument: "after" }
        );

        if (restarted) {
            return {
                remaining: limit - restarted.used,
                limit,
                resetAt: new Date(restarted.windowStartedAt.getTime() + windowMs),
            };
        }

        const existing = await MinecraftBackUsage.findOne({ minecraftUuid: key });

        if (!existing) {
            const created = await MinecraftBackUsage.create({
                minecraftUuid: key,
                used: 1,
                windowStartedAt: now,
            });
            return { remaining: limit - 1, limit, resetAt: new Date(created.windowStartedAt.getTime() + windowMs) };
        }

        const spent = await MinecraftBackUsage.findOneAndUpdate(
            { minecraftUuid: key, used: { $lt: limit }, windowStartedAt: { $gt: windowFloor } },
            { $inc: { used: 1 } },
            { returnDocument: "after" }
        );

        if (!spent) return null;

        return {
            remaining: Math.max(0, limit - spent.used),
            limit,
            resetAt: new Date(spent.windowStartedAt.getTime() + windowMs),
        };
    }

    /** The budget without spending any of it, for the join-time cache warm. */
    static async peek(uuid: string, limit: number, windowMs: number): Promise<BackBudget> {
        const row = await this.get(uuid);
        const now = Date.now();

        if (!row || row.windowStartedAt.getTime() + windowMs <= now) {
            return { remaining: limit, limit, resetAt: new Date(now + windowMs) };
        }

        return {
            remaining: Math.max(0, limit - row.used),
            limit,
            resetAt: new Date(row.windowStartedAt.getTime() + windowMs),
        };
    }
}
