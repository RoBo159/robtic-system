import { QuestGenerationRepository, QuestSettingsRepository } from "@database/repositories";
import { QUEST_TIERS, QUEST_TIER_SPECS, type QuestTier } from "@constants";
import { tierEnabled } from "@database/models";
import { Logger } from "@logger";
import { enumerateOccurrences, scheduledInstantFor, localWeekKey, type WindowOccurrence } from "./windows";
import { occasionRandom, randomInt } from "./seeded-random";

const CTX = "quests";
const HOUR_MS = 60 * 60 * 1000;

/** How far back to look for windows that elapsed while the bot was down. */
const LOOKBACK_MS = 26 * HOUR_MS;
/** How far ahead to plan, so a window is scheduled before it opens. */
const LOOKAHEAD_MS = 2 * HOUR_MS;

/**
 * Records what should happen, without making any of it happen.
 *
 * Planning and firing are separate on purpose: the instant a quest will appear is chosen here and
 * persisted, so a restart cannot re-roll it and a window can never be used twice. The unique index
 * on `(guildId, tier, windowKey)` is the mechanism — planning inserts and treats a duplicate key as
 * "already planned", by us or by a previous boot.
 */
export async function planGeneration(guildId: string, now = new Date()): Promise<number> {
    const settings = await QuestSettingsRepository.getCached(guildId);
    const nowMs = now.getTime();

    const occurrences = enumerateOccurrences(
        settings.windows,
        settings.utcOffsetMinutes,
        nowMs - LOOKBACK_MS,
        nowMs + LOOKAHEAD_MS,
    );

    if (occurrences.length === 0) return 0;

    let planned = 0;

    for (const tier of QUEST_TIERS) {
        if (!tierEnabled(settings, tier)) continue;

        const spec = QUEST_TIER_SPECS[tier];
        const eligible = spec.weeklyCount
            ? await weeklyChosenOccurrences(guildId, tier, occurrences, settings.utcOffsetMinutes, nowMs)
            : occurrences;

        for (const occurrence of eligible) {
            if (await planOne(guildId, tier, occurrence, nowMs)) planned++;
        }
    }

    return planned;
}

async function planOne(
    guildId: string,
    tier: QuestTier,
    occurrence: WindowOccurrence,
    nowMs: number,
): Promise<boolean> {
    const spec = QUEST_TIER_SPECS[tier];
    const scheduledAt = scheduledInstantFor(guildId, tier, occurrence);

    // A window that closed while the bot was down, past whatever grace the tier allows, is written
    // straight in as a tombstone. It occupies the unique key so it can never be planned again, and
    // it never fires — firing a "morning" daily at midnight is worse than skipping it.
    const elapsed = occurrence.endMs + spec.graceHours * HOUR_MS < nowMs;

    return QuestGenerationRepository.plan({
        guildId,
        tier,
        windowKey: occurrence.windowKey,
        scheduledAt,
        status: elapsed ? "missed" : "scheduled",
        reason: elapsed ? "window-elapsed-offline" : "",
    });
}

/**
 * Which of this week's occurrences a weekly tier will actually use.
 *
 * A coin flip per window would give a guild five hard quests one week and none the next. Instead a
 * single planner row per week rolls the count once, picks that many occurrences, and persists the
 * choice — so windows say *when* a tier may appear and the planner says *how often* it does.
 * Because the row is claimed through the same unique index, the roll survives restarts and races.
 */
async function weeklyChosenOccurrences(
    guildId: string,
    tier: QuestTier,
    occurrences: WindowOccurrence[],
    utcOffsetMinutes: number,
    nowMs: number,
): Promise<WindowOccurrence[]> {
    const spec = QUEST_TIER_SPECS[tier];
    if (!spec.weeklyCount) return occurrences;

    const weekKey = localWeekKey(nowMs, utcOffsetMinutes);
    const thisWeek = occurrences.filter(o => localWeekKey(o.startMs, utcOffsetMinutes) === weekKey);
    if (thisWeek.length === 0) return [];

    const existing = await QuestGenerationRepository.findPlan(guildId, tier, weekKey);

    if (existing) {
        const chosen = new Set(existing.chosenWindowKeys);
        return thisWeek.filter(o => chosen.has(o.windowKey));
    }

    const random = occasionRandom(guildId, tier, weekKey);
    const count = Math.min(thisWeek.length, randomInt(random, spec.weeklyCount.min, spec.weeklyCount.max));

    // Shuffle deterministically, then take the first `count`.
    const shuffled = [...thisWeek];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const chosen = shuffled.slice(0, count).sort((a, b) => a.startMs - b.startMs);

    const claimed = await QuestGenerationRepository.plan({
        guildId,
        tier,
        windowKey: weekKey,
        scheduledAt: new Date(thisWeek[0]!.startMs),
        status: "generated",
        reason: "week-plan",
        plannedCount: count,
        chosenWindowKeys: chosen.map(o => o.windowKey),
    });

    if (!claimed) {
        // Someone else planned the week between our read and our write. Their choice is authoritative.
        const winner = await QuestGenerationRepository.findPlan(guildId, tier, weekKey);
        const keys = new Set(winner?.chosenWindowKeys ?? []);
        return thisWeek.filter(o => keys.has(o.windowKey));
    }

    Logger.debug(`Planned ${count} ${tier} quest(s) for ${guildId} in ${weekKey}`, CTX);
    return chosen;
}
