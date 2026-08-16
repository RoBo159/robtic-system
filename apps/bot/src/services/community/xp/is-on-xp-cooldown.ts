import { XP_CONFIG } from "@constants";

/**
 * Whether this member earned XP too recently to earn again.
 *
 * `reductionPercent` comes from the Premium Engine's `XP_COOLDOWN_REDUCTION`, and defaults to zero
 * so every existing caller behaves exactly as before. It is clamped to 90% rather than 100%: a
 * cooldown of zero would let a single spammed line earn on every message, which is the thing the
 * cooldown exists to stop and not something a premium tier should be able to sell.
 */
export function isOnXPCooldown(lastGrant: Date, reductionPercent = 0): boolean {
    const clamped = Math.min(90, Math.max(0, reductionPercent));
    const cooldownMs = XP_CONFIG.cooldownMs * (1 - clamped / 100);

    return Date.now() - lastGrant.getTime() < cooldownMs;
}
