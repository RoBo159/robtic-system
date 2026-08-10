import { XP_CONFIG } from "@constants";

export function isOnXPCooldown(lastGrant: Date): boolean {
    return Date.now() - lastGrant.getTime() < XP_CONFIG.cooldownMs;
}
