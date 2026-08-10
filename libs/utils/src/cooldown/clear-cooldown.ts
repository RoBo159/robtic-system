import { cooldowns, scopeKey } from "./cooldown-store";

/** Rolls back a cooldown started for an attempt that ultimately failed (e.g. the command threw), so the failed attempt isn't charged against the user. */
export function clearCooldown(userId: string, commandName: string, scopeId = "dm"): void {
    const key = scopeKey(commandName, scopeId);
    const timestamps = cooldowns.get(key);
    if (!timestamps) return;

    timestamps.delete(userId);
    if (timestamps.size === 0) cooldowns.delete(key);
}
