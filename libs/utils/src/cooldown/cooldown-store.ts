/**
 * In-memory cooldowns, keyed by `command:scope` then user id, holding the timestamp the cooldown
 * expires at.
 *
 * Expiry rather than start time is what makes the sweep below possible: an entry knows on its own
 * when it stops mattering, without the caller having to supply the duration it was created with.
 */
export const cooldowns = new Map<string, Map<string, number>>();

export function scopeKey(commandName: string, scopeId: string): string {
    return `${commandName}:${scopeId}`;
}

/** Sweep every N writes rather than on a timer — the store is only ever touched from command dispatch. */
const SWEEP_EVERY_WRITES = 500;
let writesSinceSweep = 0;

/** Drops expired entries so a busy guild's command history doesn't accumulate for the process lifetime. */
export function sweepExpired(now: number): void {
    for (const [key, timestamps] of cooldowns) {
        for (const [userId, expiresAt] of timestamps) {
            if (expiresAt <= now) timestamps.delete(userId);
        }
        if (timestamps.size === 0) cooldowns.delete(key);
    }
}

export function noteWrite(now: number): void {
    if (++writesSinceSweep < SWEEP_EVERY_WRITES) return;
    writesSinceSweep = 0;
    sweepExpired(now);
}
