import { ComboSettingsRepository } from "@database/repositories";
import { COMBO_CONFIG, COMBO_SCORE_RANGE_CACHE_TTL_MS } from "@constants";

interface ScoreRange {
    min: number;
    max: number;
}

/** Short-TTL cache so the per-guild-configurable score range doesn't cost a Mongo read on every message. */
const scoreRangeCache = new Map<string, { range: ScoreRange; expiresAt: number }>();

export async function getScoreRange(guildId: string): Promise<ScoreRange> {
    const cached = scoreRangeCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.range;

    const settings = await ComboSettingsRepository.get(guildId);
    const range: ScoreRange = {
        min: settings?.minScorePerMessage ?? COMBO_CONFIG.minScorePerMessage,
        max: settings?.maxScorePerMessage ?? COMBO_CONFIG.maxScorePerMessage,
    };
    scoreRangeCache.set(guildId, { range, expiresAt: Date.now() + COMBO_SCORE_RANGE_CACHE_TTL_MS });
    return range;
}

/** Called after an admin updates the per-guild score range so the new values take effect immediately. */
export function invalidateScoreRangeCache(guildId: string): void {
    scoreRangeCache.delete(guildId);
}
