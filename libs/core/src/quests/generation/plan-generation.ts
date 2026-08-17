import { QuestGenerationRepository, QuestSettingsRepository } from "@database/repositories";
import { QUEST_TIERS, QUEST_TIER_SPECS, type QuestTier } from "@constants";
import { tierEnabled } from "@database/models";
import { Logger } from "@logger";
import { enumerateOccurrences, pickInstantIn, localWeekKey, localDateKey, type WindowOccurrence } from "./windows";
import { randomInt, shuffle } from "./random";

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

        // Special is posted by an admin, never scheduled. Without this it would fall through to the
        // "one per window" default below and start appearing on its own.
        if (spec.manual) continue;

        const eligible = spec.dailyCount
            ? await dailySlots(guildId, tier, occurrences, settings.utcOffsetMinutes)
            : spec.weeklyCount
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
    // Rolled here and stored on the row. A later tick that reaches the same occasion loses the
    // insert on the unique index, so the first roll is the one that stands.
    const scheduledAt = pickInstantIn(occurrence);

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
 * How many of a daily tier appear today, and when.
 *
 * The count is rolled once per local day and the times follow from it: seven Easy quests one day,
 * four the next, each at its own random minute. Nothing about it is derivable — not from the guild
 * id, not from the date. Whether today carries a Hard is decided the first time the planner looks
 * at today, and until then the answer does not exist.
 *
 * **Which is exactly why the count is written down.** A fresh roll on every tick would add slots to
 * a day already under way — a second tick rolling 7 where the first rolled 4 would plan three more
 * Easy quests, and nothing downstream would notice. The day plan row is claimed through the same
 * unique index as everything else, so the first writer's number is the day's number, for every
 * later tick and every other worker.
 *
 * Slots are dealt round-robin across the day's windows, so seven quests over three windows land
 * 3/2/2 rather than piling into one.
 */
async function dailySlots(
    guildId: string,
    tier: QuestTier,
    occurrences: WindowOccurrence[],
    utcOffsetMinutes: number,
): Promise<WindowOccurrence[]> {
    const spec = QUEST_TIER_SPECS[tier];
    if (!spec.dailyCount) return [];

    const byDay = new Map<string, WindowOccurrence[]>();
    for (const occurrence of occurrences) {
        const dateKey = localDateKey(occurrence.startMs, utcOffsetMinutes);
        byDay.set(dateKey, [...(byDay.get(dateKey) ?? []), occurrence]);
    }

    const slots: WindowOccurrence[] = [];

    for (const [dateKey, inDay] of byDay) {
        if (inDay.length === 0) continue;

        const count = await dailyCountFor(guildId, tier, dateKey, inDay[0]!.startMs, spec.dailyCount);

        for (let index = 0; index < count; index++) {
            const window = inDay[index % inDay.length]!;

            // A distinct key per slot: it is the generation row's unique key and the quest's
            // cycleKey. Without the suffix the second Easy of the day would collide with the first
            // and silently never exist.
            slots.push({ ...window, windowKey: `${window.windowKey}#${index}` });
        }
    }

    return slots;
}

/** The day's count, rolled once and remembered — the roll that must never happen twice. */
async function dailyCountFor(
    guildId: string,
    tier: QuestTier,
    dateKey: string,
    dayStartMs: number,
    range: { min: number; max: number },
): Promise<number> {
    const existing = await QuestGenerationRepository.findPlan(guildId, tier, dateKey);
    if (existing) return existing.plannedCount ?? 0;

    const count = randomInt(range.min, range.max);

    const claimed = await QuestGenerationRepository.plan({
        guildId,
        tier,
        windowKey: dateKey,
        scheduledAt: new Date(dayStartMs),
        // `generated` rather than `scheduled`: this row records a decision, it is not itself a
        // quest waiting to fire, and the firing query must never lease it.
        status: "generated",
        reason: "day-plan",
        plannedCount: count,
    });

    if (claimed) {
        Logger.debug(`Rolled ${count} ${tier} quest(s) for ${guildId} on ${dateKey}`, CTX);
        return count;
    }

    // Another worker rolled it between the read and the write. Theirs is the day's number — the
    // whole point of persisting it is that there is exactly one answer.
    const winner = await QuestGenerationRepository.findPlan(guildId, tier, dateKey);
    return winner?.plannedCount ?? 0;
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

    // The count may legitimately roll zero — that is how a weekly tier stays rare. Persisted with
    // the rest of the plan, so a week that rolled "no Golden" stays that way instead of re-rolling
    // on the next tick until it succeeds.
    const count = Math.min(thisWeek.length, randomInt(spec.weeklyCount.min, spec.weeklyCount.max));
    const chosen = shuffle([...thisWeek]).slice(0, count).sort((a, b) => a.startMs - b.startMs);

    const claimed = await QuestGenerationRepository.plan({
        guildId,
        tier,
        windowKey: weekKey,
        scheduledAt: new Date(thisWeek[0]!.startMs),
        status: "generated",
        reason: count > 0 ? "week-plan" : "week-plan-none",
        plannedCount: count,
        chosenWindowKeys: chosen.map(o => o.windowKey),
    });

    if (!claimed) {
        // Someone else planned the week between our read and our write. Their choice is authoritative.
        const winner = await QuestGenerationRepository.findPlan(guildId, tier, weekKey);
        const keys = new Set(winner?.chosenWindowKeys ?? []);
        return thisWeek.filter(o => keys.has(o.windowKey));
    }

    Logger.debug(
        count > 0
            ? `Planned ${count} ${tier} quest(s) for ${guildId} in ${weekKey}`
            : `No ${tier} quest for ${guildId} in ${weekKey} — the weekly roll came up zero`,
        CTX,
    );
    return chosen;
}
