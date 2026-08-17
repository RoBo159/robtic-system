/**
 * Answers "how many quests actually appear per day", by running the real scheduling primitives.
 *
 * Uses `enumerateOccurrences` and `pickInstantIn` exactly as `plan-generation.ts` does, then
 * applies the one rule that decides the answer: `fire-generation.ts` skips a tier while a quest of
 * that tier is still open (`exclusive` + `hasOpenOfTier`). No database, no clock — just the maths.
 */
import { enumerateOccurrences, pickInstantIn, localWeekKey } from "@core/quests/generation/windows";
import { randomInt } from "@core/quests/generation/random";
import { DEFAULT_QUEST_WINDOWS, QUEST_TIERS, QUEST_TIER_SPECS, type QuestTier } from "@constants";

const DAYS = Number(process.argv[2] ?? 28);
const GUILD = process.argv[3] ?? "guild-1";
const OFFSET = 0;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const windows = DEFAULT_QUEST_WINDOWS.map(w => ({ ...w }));

/** `EASY_HOURS=12 NORMAL_HOURS=18` re-runs the same maths against a proposed retune. */
const override = (tier: QuestTier): { min: number; max: number } | null => {
    const raw = process.env[`${tier.toUpperCase()}_HOURS`];
    return raw ? { min: Number(raw), max: Number(raw) } : null;
};
const start = Date.UTC(2026, 0, 5); // a Monday
const end = start + DAYS * DAY;

const occurrences = enumerateOccurrences(windows, OFFSET, start, end);

/** Which occurrences a weekly tier uses, mirroring `weeklyChosenOccurrences`. */
function weeklyPlan(tier: QuestTier): Set<string> {
    const spec = QUEST_TIER_SPECS[tier];
    const chosen = new Set<string>();
    if (!spec.weeklyCount) return chosen;

    const weeks = new Map<string, typeof occurrences>();
    for (const occurrence of occurrences) {
        const key = localWeekKey(occurrence.startMs, OFFSET);
        weeks.set(key, [...(weeks.get(key) ?? []), occurrence]);
    }

    for (const [weekKey, inWeek] of weeks) {
        const count = Math.min(inWeek.length, randomInt(spec.weeklyCount.min, spec.weeklyCount.max));
        const shuffled = [...inWeek].sort(() => Math.random() - 0.5);
        for (const occurrence of shuffled.slice(0, count)) chosen.add(occurrence.windowKey);
    }

    return chosen;
}

/** Mirrors `dailySlots` in plan-generation.ts: roll the count per day, deal it across the windows. */
function dailyPlan(tier: QuestTier) {
    const spec = QUEST_TIER_SPECS[tier];
    const slots: { windowKey: string; startMs: number; endMs: number }[] = [];
    if (!spec.dailyCount) return slots;

    const byDay = new Map<string, typeof occurrences>();
    for (const occurrence of occurrences) {
        const day = new Date(occurrence.startMs).toISOString().slice(0, 10);
        byDay.set(day, [...(byDay.get(day) ?? []), occurrence]);
    }

    for (const [day, inDay] of byDay) {
        const count = randomInt(spec.dailyCount.min, spec.dailyCount.max);
        for (let index = 0; index < count; index++) {
            const window = inDay[index % inDay.length]!;
            slots.push({ ...window, windowKey: `${window.windowKey}#${index}` });
        }
    }

    return slots;
}

interface Fired { tier: QuestTier; at: number; until: number }
const fired: Fired[] = [];
/** When each tier's current quest stops being "open", which is what blocks the next one. */
const openUntil = new Map<QuestTier, number>();

for (const tier of QUEST_TIERS) {
    const spec = QUEST_TIER_SPECS[tier];
    const plan = spec.weeklyCount ? weeklyPlan(tier) : null;
    const candidates = spec.dailyCount ? dailyPlan(tier) : occurrences;

    for (const occurrence of candidates) {
        if (plan && !plan.has(occurrence.windowKey)) continue;

        const at = pickInstantIn(occurrence).getTime();
        if (at < start || at >= end) continue;

        // fire-generation.ts: `exclusive && hasOpenOfTier` → skipped.
        if (spec.exclusive && (openUntil.get(tier) ?? 0) > at) continue;

        const duration = override(tier) ?? spec.durationHours;
        const hours = randomInt(duration.min, duration.max);
        openUntil.set(tier, at + hours * HOUR);
        fired.push({ tier, at, until: at + hours * HOUR });
    }
}

fired.sort((a, b) => a.at - b.at);

// Per-day breakdown.
const perDay = new Map<string, QuestTier[]>();
for (const f of fired) {
    const day = new Date(f.at).toISOString().slice(0, 10);
    perDay.set(day, [...(perDay.get(day) ?? []), f.tier]);
}

const EMOJI: Record<QuestTier, string> = { easy: "🟢", normal: "🔵", hard: "🟣", golden: "🌟", vip: "💎", special: "🎁" };

console.log(`${DAYS} days, guild "${GUILD}", default windows (08–11, 13–16, 18–22)\n`);
console.log("day          quests  which");

const counts: number[] = [];
const claimableCounts: number[] = [];

for (let d = 0; d < DAYS; d++) {
    const day = new Date(start + d * DAY).toISOString().slice(0, 10);
    const tiers = perDay.get(day) ?? [];
    counts.push(tiers.length);
    claimableCounts.push(tiers.filter(t => t !== "vip").length);

    console.log(`${day}   ${String(tiers.length).padStart(2)}     ${tiers.map(t => `${EMOJI[t]} ${t}`).join("  ")}`);
}

const total = fired.length;
const byTier = Object.fromEntries(QUEST_TIERS.map(t => [t, fired.filter(f => f.tier === t).length]));
const avg = (list: number[]) => (list.reduce((a, b) => a + b, 0) / list.length).toFixed(2);

console.log(`\ntotal: ${total} quests over ${DAYS} days`);
console.log(`per tier: ${QUEST_TIERS.map(t => `${t} ${byTier[t]}`).join(" · ")}`);
console.log(`\naverage per day: ${avg(counts)}  (everyone, incl. VIP)`);
console.log(`average per day: ${avg(claimableCounts)}  (non-premium — VIP excluded)`);
// How crowded the board gets: a tier posting faster than its quests expire stacks up.
const peak = Object.fromEntries(QUEST_TIERS.map(tier => {
    const mine = fired.filter(f => f.tier === tier);
    const most = Math.max(0, ...mine.map(f => mine.filter(o => o.at <= f.at && o.until > f.at).length));
    return [tier, most];
}));
console.log(`peak open at once: ${QUEST_TIERS.map(t => `${t} ${peak[t]}`).join(" · ")}`);

console.log(`days with 3+: ${counts.filter(n => n >= 3).length}/${DAYS}   days with 2: ${counts.filter(n => n === 2).length}   days with <2: ${counts.filter(n => n < 2).length}`);
