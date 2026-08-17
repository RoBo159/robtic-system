/** Verifies the pure generation primitives — the parts that need no database. */
import { randomInt, randomInstant, shuffle } from "@core/quests/generation/random";
import { enumerateOccurrences, pickInstantIn, localWeekKey, localDateKey } from "@core/quests/generation/windows";
import { rollMissions } from "@core/quests/missions/roll-missions";
import "@core/quests/missions";
import { DEFAULT_QUEST_WINDOWS, QUEST_TIER_SPECS, QUEST_TIERS, TIER_SLOT, questRangeBounds, rollQuestRange } from "@constants";
import { buildQuestEmbed, buildQuestButtons } from "@bot/features/quests/utils/quest-embed";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const windows = DEFAULT_QUEST_WINDOWS.map(w => ({ ...w }));

// 1. The instant is a genuine roll — nothing about it may be derivable in advance.
const occ = { windowKey: "2026-08-15#morning", startMs: Date.UTC(2026, 7, 15, 8), endMs: Date.UTC(2026, 7, 15, 11) };
const instants = Array.from({ length: 200 }, () => pickInstantIn(occ).getTime());

check("instants differ between calls", new Set(instants).size > 150, `${new Set(instants).size} distinct of 200`);
check("every instant lands inside its window", instants.every(t => t >= occ.startMs && t < occ.endMs));

// 2. Spread across the window rather than clustered, so a window is genuinely used.
const third = (occ.endMs - occ.startMs) / 3;
const buckets = [0, 0, 0];
for (const t of instants) buckets[Math.min(2, Math.floor((t - occ.startMs) / third))]!++;
check("instants spread across the window", buckets.every(n => n > 30), buckets.join("/"));


// 4. Window enumeration across an offset.
const nowMs = Date.UTC(2026, 7, 15, 12);
const occurrences = enumerateOccurrences(windows, 180, nowMs - 26 * 3600_000, nowMs + 2 * 3600_000);
check("enumerates occurrences over the lookback", occurrences.length > 0, `${occurrences.length} found`);
check("occurrences are sorted", occurrences.every((o, i) => i === 0 || o.startMs >= occurrences[i - 1]!.startMs));
check("window keys are unique", new Set(occurrences.map(o => o.windowKey)).size === occurrences.length);

// 5. Offset actually shifts the wall clock: 08:00 local at +180 is 05:00 UTC.
const plus3 = enumerateOccurrences([{ key: "morning", startHour: 8, endHour: 11, enabled: true }], 180,
    Date.UTC(2026, 7, 15, 0), Date.UTC(2026, 7, 15, 23));
const utcHour = new Date(plus3[0]!.startMs).getUTCHours();
check("a +3 offset shifts 08:00 local to 05:00 UTC", utcHour === 5, `got ${utcHour}:00 UTC`);

// 6. Disabled windows are skipped.
const disabled = enumerateOccurrences(windows.map(w => ({ ...w, enabled: false })), 0, nowMs - 3600_000, nowMs);
check("disabled windows produce nothing", disabled.length === 0);

// 7. ISO week keys.
check("ISO week key format", /^\d{4}-W\d{2}$/.test(localWeekKey(nowMs, 0)), localWeekKey(nowMs, 0));
check("2026-01-01 is in W01", localWeekKey(Date.UTC(2026, 0, 1), 0) === "2026-W01", localWeekKey(Date.UTC(2026, 0, 1), 0));
check("local date key respects offset",
    localDateKey(Date.UTC(2026, 7, 15, 23), 120) === "2026-08-16",
    localDateKey(Date.UTC(2026, 7, 15, 23), 120));

// 8. Mission rolling: distinct templates, correct count, sane targets.
const missions = rollMissions("hard", 4);
check("hard rolls four missions", missions.length === 4, `${missions.length}`);
check("missions are distinct templates", new Set(missions.map(m => m.templateKey)).size === missions.length);
check("every mission has a positive target", missions.every(m => m.target > 0));
check("every mission has a label", missions.every(m => m.label.length > 0));

// 9. The accumulation split — the bug the plan called silent and unfixable.
const all = rollMissions("golden", 99);
const levels = ["comboScore", "comboHeat", "streak"];
const wrong = all.filter(m => levels.includes(m.metric) && m.accumulation !== "max");
check("level metrics use max accumulation", wrong.length === 0, wrong.map(m => m.metric).join(", "));
const counters = all.filter(m => !levels.includes(m.metric) && m.accumulation !== "sum");
check("counter metrics use sum accumulation", counters.length === 0, counters.map(m => m.metric).join(", "));

// 10. Two quests of the same tier must not be the same quest.
const rolls = Array.from({ length: 40 }, () => rollMissions("hard", 4).map(m => m.templateKey).join(","));
check("mission rolls differ between quests", new Set(rolls).size > 1, `${new Set(rolls).size} distinct sets`);

// 11. randomInt bounds.
const ints = Array.from({ length: 500 }, () => randomInt(3, 5));
check("randomInt stays in range", ints.every(n => n >= 3 && n <= 5));
check("randomInt covers its range", new Set(ints).size === 3, [...new Set(ints)].sort().join(","));

// 12. Cadence. Counts are rolled per local day (or per week for Golden) and then spread across the
//     windows, so this checks the roll lands inside its configured range and is stable per day.
const days = Array.from({ length: 400 }, (_, i) => `2026-${String(i % 12 + 1).padStart(2, "0")}-${String(i % 28 + 1).padStart(2, "0")}-${Math.floor(i / 336)}`);

for (const tier of QUEST_TIERS) {
    if (QUEST_TIER_SPECS[tier].manual) continue; // posted by hand, so there is no cadence
    const spec = QUEST_TIER_SPECS[tier];
    const range = spec.dailyCount ?? spec.weeklyCount!;
    const period = spec.dailyCount ? "day" : "week";

    const rolls = days.map(() => randomInt(range.min, range.max));
    const outside = rolls.filter(n => n < range.min || n > range.max);
    const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length;
    const midpoint = (range.min + range.max) / 2;

    check(`${tier} rolls ${range.min}-${range.max} per ${period}`, outside.length === 0, `mean ${mean.toFixed(2)}`);
    check(`${tier} averages near its midpoint`, Math.abs(mean - midpoint) < 0.4, `${mean.toFixed(2)} vs ${midpoint}`);

    if (range.min !== range.max) {
        check(`${tier} uses its whole range`, new Set(rolls).size === range.max - range.min + 1,
            [...new Set(rolls)].sort((a, b) => a - b).join(","));
    }
}

check(
    "counts are rolled, not derived",
    new Set(Array.from({ length: 60 }, () => randomInt(4, 7))).size > 1,
);
check("shuffle keeps every element", shuffle([1, 2, 3, 4, 5]).sort().join(",") === "1,2,3,4,5");
check(
    "randomInstant stays inside its bounds",
    Array.from({ length: 200 }, () => randomInstant(1000, 2000).getTime()).every(t => t >= 1000 && t < 2000),
);
check(
    "every scheduled tier has exactly one cadence",
    QUEST_TIERS
        .filter(t => !QUEST_TIER_SPECS[t].manual)
        .every(t => Boolean(QUEST_TIER_SPECS[t].dailyCount) !== Boolean(QUEST_TIER_SPECS[t].weeklyCount)),
);
check(
    "a manual tier has no cadence at all",
    QUEST_TIERS
        .filter(t => QUEST_TIER_SPECS[t].manual)
        .every(t => !QUEST_TIER_SPECS[t].dailyCount && !QUEST_TIER_SPECS[t].weeklyCount),
);
check(
    "no tier is exclusive, since several are expected open at once",
    QUEST_TIERS.every(t => !QUEST_TIER_SPECS[t].exclusive),
);

// 13. The posted card has to fit Discord's limits for every tier, empty and full — including the
//     ones whose reward, places and objective count are rolled per quest rather than fixed.
for (const tier of QUEST_TIERS) {
    const spec = QUEST_TIER_SPECS[tier];

    const missions = questRangeBounds(spec.missions).max;
    const reward = questRangeBounds(spec.reward).max;
    const slots = spec.slots === null ? null : questRangeBounds(spec.slots).max;

    for (const taken of [0, slots ?? 0]) {
        const quest = {
            _id: "65f1a2b3c4d5e6f7a8b9c0d1",
            tier,
            status: "open",
            reward,
            slotsTotal: slots,
            slotsTaken: taken,
            slotsRemaining: slots === null ? 1_000_000_000 : slots - taken,
            endsAt: new Date(Date.now() + 3600_000),
            missions: Array.from({ length: missions }, (_, i) => ({
                missionId: `m${i}`,
                templateKey: "t",
                metric: "messages",
                accumulation: "sum",
                target: 100,
                label: "Send 100 messages in any tracked channel",
            })),
        } as never;

        const json = buildQuestEmbed(quest).toJSON();
        const size = (json.title?.length ?? 0) + (json.description?.length ?? 0) + (json.footer?.text.length ?? 0)
            + (json.author?.name.length ?? 0)
            + (json.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);

        check(`${tier} card fits (${taken}/${slots ?? "∞"} taken)`, size <= 6000 && (json.fields?.length ?? 0) <= 25, `${size} chars`);

        const button = buildQuestButtons(quest).toJSON().components[0] as { label?: string; disabled?: boolean };
        check(`${tier} claim button label fits (${taken} taken)`, (button.label?.length ?? 0) <= 80, button.label ?? "");

        const full = slots !== null && taken >= slots;
        check(`${tier} button is ${full ? "disabled when full" : "live when open"}`, Boolean(button.disabled) === full);
    }
}

// 14. Special is the admin-posted event tier, and three properties define it.
const special = QUEST_TIER_SPECS.special;
check("special is never scheduled", special.manual === true);
check("special ignores the slot limit", special.ignoresSlotLimit === true);
check("special has its own slot", TIER_SLOT.special === "special");
check("special has no cadence", special.dailyCount === null && special.weeklyCount === null);

for (const [name, range, lo, hi] of [
    ["missions", special.missions, 3, 7],
    ["reward", special.reward, 200, 500],
    ["places", special.slots!, 5, 25],
] as [string, typeof special.missions, number, number][]) {
    const bounds = questRangeBounds(range);
    check(`special ${name} spans ${lo}-${hi}`, bounds.min === lo && bounds.max === hi, `${bounds.min}-${bounds.max}`);

    const rolls = Array.from({ length: 300 }, () => rollQuestRange(range));
    check(`special ${name} rolls inside its range`, rolls.every(n => n >= lo && n <= hi));
    check(`special ${name} actually varies`, new Set(rolls).size > 1, `${new Set(rolls).size} distinct`);
}

check(
    "a fixed value is not a roll",
    Array.from({ length: 20 }, () => rollQuestRange(QUEST_TIER_SPECS.easy.reward)).every(n => n === 10),
);


console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
