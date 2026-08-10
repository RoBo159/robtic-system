import { cooldowns, scopeKey, noteWrite } from "./cooldown-store";

/**
 * Claims the cooldown slot for this user and command.
 *
 * Returns 0 when the command may run — the cooldown has been started as a side effect — or the
 * whole seconds remaining when it may not. This used to be a separate `isOnCooldown` predicate
 * that also wrote, plus a `getRemainingCooldown` read to build the message: two lookups, and a
 * predicate whose name gave no hint that calling it started a timer.
 */
export function startCooldown(userId: string, commandName: string, cooldownMs: number, scopeId = "dm"): number {
    const key = scopeKey(commandName, scopeId);
    const now = Date.now();

    let timestamps = cooldowns.get(key);
    if (!timestamps) {
        timestamps = new Map<string, number>();
        cooldowns.set(key, timestamps);
    }

    const expiresAt = timestamps.get(userId);
    if (expiresAt !== undefined && now < expiresAt) {
        return Math.ceil((expiresAt - now) / 1000);
    }

    timestamps.set(userId, now + cooldownMs);
    noteWrite(now);
    return 0;
}
