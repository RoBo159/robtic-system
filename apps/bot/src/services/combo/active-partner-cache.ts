import { COMBO_CONFIG } from "@constants";
import type { ActivePartnerInfo } from "../combo-conversation-detector";

/**
 * Self-populating in-memory cache of each user's current highest-active-combo partner, keyed by
 * `guildId:userId`. Populated as a side effect of every processed message so the detector's
 * "continuity" signal never needs a DB read on the hot path; entries simply expire after the combo
 * expiry window.
 */
const activePartnerCache = new Map<string, { partnerId: string; score: number; expiresAt: number }>();

function cacheKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
}

export function getCachedPartner(guildId: string, userId: string): ActivePartnerInfo | null {
    const entry = activePartnerCache.get(cacheKey(guildId, userId));
    if (!entry || entry.expiresAt < Date.now()) return null;
    return { partnerId: entry.partnerId, score: entry.score };
}

export function cachePartners(guildId: string, userAId: string, userBId: string, score: number): void {
    const expiresAt = Date.now() + COMBO_CONFIG.expireMs;
    activePartnerCache.set(cacheKey(guildId, userAId), { partnerId: userBId, score, expiresAt });
    activePartnerCache.set(cacheKey(guildId, userBId), { partnerId: userAId, score, expiresAt });
}
