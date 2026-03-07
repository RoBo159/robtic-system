import { Collection } from "discord.js";

const cooldowns = new Collection<string, Collection<string, number>>();

export function isOnCooldown(userId: string, commandName: string, cooldownMs: number): boolean {
    if (!cooldowns.has(commandName)) {
        cooldowns.set(commandName, new Collection());
    }

    const timestamps = cooldowns.get(commandName)!;
    const now = Date.now();

    if (timestamps.has(userId)) {
        const expiresAt = timestamps.get(userId)! + cooldownMs;
        if (now < expiresAt) return true;
    }

    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownMs);
    return false;
}

export function getRemainingCooldown(userId: string, commandName: string, cooldownMs: number): number {
    const timestamps = cooldowns.get(commandName);
    if (!timestamps?.has(userId)) return 0;

    const expiresAt = timestamps.get(userId)! + cooldownMs;
    const remaining = expiresAt - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
