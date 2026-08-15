import { ActivityXP } from "@database/models";
import { Logger } from "@logger";

const CTX = "activity";

/** guildId:userId → last meaningful interaction. */
const lastActivity = new Map<string, number>();

/** Keys touched since the last flush, so a flush writes only what moved. */
const dirty = new Set<string>();

const keyOf = (guildId: string, discordId: string) => `${guildId}:${discordId}`;

/**
 * What counts as being present.
 *
 * Deliberately broad and open-ended: anything a member does on purpose keeps them active, and a
 * new system adds a source here without touching whatever reads it.
 */
export type ActivitySource =
    | "message"
    | "command"
    | "reaction"
    | "combo"
    | "streak"
    | "quest"
    | "voice-state"
    | "other";

/**
 * Records that a member did something.
 *
 * In-memory and synchronous by design. This is called from the message path, so it has to cost
 * nothing — the map is the source of truth while the process lives, and `flushActivity` persists
 * it on a timer so the value survives a restart.
 */
export function touchActivity(guildId: string, discordId: string, _source: ActivitySource = "other"): void {
    const key = keyOf(guildId, discordId);
    lastActivity.set(key, Date.now());
    dirty.add(key);
}

/**
 * When the member was last active, or null if this process has not seen them.
 *
 * Null is not "inactive" — it means unknown, and the caller decides. The voice tick treats it as a
 * reason to consult the database once rather than as grounds to withhold XP.
 */
export function getLastActivity(guildId: string, discordId: string): number | null {
    return lastActivity.get(keyOf(guildId, discordId)) ?? null;
}

/** Seeds the cache from a persisted timestamp, so a restart does not read as everyone being AFK. */
export function primeActivity(guildId: string, discordId: string, at: Date): void {
    const key = keyOf(guildId, discordId);
    if (!lastActivity.has(key)) lastActivity.set(key, at.getTime());
}

/**
 * Persists everything touched since the last call.
 *
 * One bulk write rather than a document per member, and only for keys that actually moved — an
 * idle guild flushes nothing. `decay.lastActiveAt` is the field XP decay already keys on, so
 * presence and decay cannot disagree about when someone was last around.
 */
export async function flushActivity(): Promise<number> {
    if (dirty.size === 0) return 0;

    const operations = [...dirty].flatMap(key => {
        const at = lastActivity.get(key);
        if (!at) return [];

        const [guildId, discordId] = key.split(":");
        return [{
            updateOne: {
                filter: { guildId, discordId },
                update: { $set: { "decay.lastActiveAt": new Date(at), "decay.inactiveDays": 0 } },
            },
        }];
    });

    dirty.clear();
    if (!operations.length) return 0;

    try {
        await ActivityXP.bulkWrite(operations, { ordered: false });
        return operations.length;
    } catch (err) {
        Logger.warn(`Could not flush activity timestamps: ${err}`, CTX);
        return 0;
    }
}

/** Drops cached entries for a guild — used when the bot leaves one. */
export function forgetGuildActivity(guildId: string): void {
    const prefix = `${guildId}:`;
    for (const key of lastActivity.keys()) {
        if (key.startsWith(prefix)) {
            lastActivity.delete(key);
            dirty.delete(key);
        }
    }
}

/** Number of members currently tracked, for diagnostics. */
export function trackedActivityCount(): number {
    return lastActivity.size;
}
