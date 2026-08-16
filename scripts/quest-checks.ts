/** Verifies the pure generation primitives — the parts that need no database. */
import { occasionRandom, randomInt } from "@core/quests/generation/seeded-random";
import { enumerateOccurrences, scheduledInstantFor, localWeekKey, localDateKey } from "@core/quests/generation/windows";
import { rollMissions } from "@core/quests/missions/roll-missions";
import "@core/quests/missions";
import { DEFAULT_QUEST_WINDOWS, QUEST_TIER_SPECS, QUEST_TIERS } from "@constants";
import { buildQuestEmbed, buildQuestButtons } from "@bot/features/quests/utils/quest-embed";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const windows = DEFAULT_QUEST_WINDOWS.map(w => ({ ...w }));

// 1. Determinism: the same occasion must always produce the same instant.
const occ = { windowKey: "2026-08-15#morning", startMs: Date.UTC(2026, 7, 15, 8), endMs: Date.UTC(2026, 7, 15, 11) };
const a = scheduledInstantFor("guild-1", "easy", occ).getTime();
const b = scheduledInstantFor("guild-1", "easy", occ).getTime();
check("scheduled instant is stable across calls", a === b, new Date(a).toISOString());

// 2. It must land inside the window.
check("scheduled instant is inside the window", a >= occ.startMs && a < occ.endMs);

// 3. Different guilds/tiers must diverge, or every server posts at the same minute.
const other = scheduledInstantFor("guild-2", "easy", occ).getTime();
const otherTier = scheduledInstantFor("guild-1", "hard", occ).getTime();
check("different guilds get different instants", a !== other);
check("different tiers get different instants", a !== otherTier);

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
const random = occasionRandom("guild-1", "hard", "2026-08-15#morning");
const missions = rollMissions("hard", 4, random);
check("hard rolls four missions", missions.length === 4, `${missions.length}`);
check("missions are distinct templates", new Set(missions.map(m => m.templateKey)).size === missions.length);
check("every mission has a positive target", missions.every(m => m.target > 0));
check("every mission has a label", missions.every(m => m.label.length > 0));

// 9. The accumulation split — the bug the plan called silent and unfixable.
const all = rollMissions("golden", 99, occasionRandom("g", "golden", "k"));
const levels = ["comboScore", "comboHeat", "streak"];
const wrong = all.filter(m => levels.includes(m.metric) && m.accumulation !== "max");
check("level metrics use max accumulation", wrong.length === 0, wrong.map(m => m.metric).join(", "));
const counters = all.filter(m => !levels.includes(m.metric) && m.accumulation !== "sum");
check("counter metrics use sum accumulation", counters.length === 0, counters.map(m => m.metric).join(", "));

// 10. Rolling is deterministic too, so a retry rebuilds the same quest.
const again = rollMissions("hard", 4, occasionRandom("guild-1", "hard", "2026-08-15#morning"));
check("mission rolls are reproducible", JSON.stringify(again) === JSON.stringify(missions));

// 11. randomInt bounds.
const r = occasionRandom("x", "y", "z");
const ints = Array.from({ length: 500 }, () => randomInt(r, 3, 5));
check("randomInt stays in range", ints.every(n => n >= 3 && n <= 5));
check("randomInt covers its range", new Set(ints).size === 3, [...new Set(ints)].sort().join(","));

// 12. Rarity. The planner's first draw off the weekly stream decides whether a weekly tier appears
//     at all; this mirrors that draw exactly, over 400 weeks, to check the odds land where the
//     tuning says and that a given week always answers the same way.
const weeks = Array.from({ length: 400 }, (_, i) => `2026-W${String(i % 52 + 1).padStart(2, "0")}-${Math.floor(i / 52)}`);

for (const tier of ["hard", "golden"] as const) {
    const chance = QUEST_TIER_SPECS[tier].spawnChance;
    const hits = weeks.filter(week => occasionRandom("guild-1", tier, week)() < chance).length;
    const rate = hits / weeks.length;

    check(
        `${tier} spawns near its ${chance} chance`,
        Math.abs(rate - chance) < 0.08,
        `${(rate * 100).toFixed(1)}% over ${weeks.length} weeks`,
    );
}

check(
    "a week's spawn roll is stable across calls",
    occasionRandom("guild-1", "golden", "2026-W33")() === occasionRandom("guild-1", "golden", "2026-W33")(),
);
check(
    "golden is rarer than hard",
    QUEST_TIER_SPECS.golden.spawnChance < QUEST_TIER_SPECS.hard.spawnChance,
);
check(
    "daily tiers are never rarity-gated",
    ["easy", "normal", "vip"].every(tier => QUEST_TIER_SPECS[tier as "easy"].spawnChance === 1),
);

// 13. The posted card has to fit Discord's limits for every tier, full or empty.
for (const tier of QUEST_TIERS) {
    const spec = QUEST_TIER_SPECS[tier];

    for (const taken of [0, spec.slots ?? 0]) {
        const quest = {
            _id: "65f1a2b3c4d5e6f7a8b9c0d1",
            tier,
            status: "open",
            reward: spec.reward,
            slotsTotal: spec.slots,
            slotsTaken: taken,
            slotsRemaining: spec.slots === null ? 1_000_000_000 : spec.slots - taken,
            endsAt: new Date(Date.now() + 3600_000),
            missions: Array.from({ length: spec.missions }, (_, i) => ({
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

        check(`${tier} card fits (${taken}/${spec.slots ?? "∞"} taken)`, size <= 6000 && (json.fields?.length ?? 0) <= 25, `${size} chars`);

        const button = buildQuestButtons(quest).toJSON().components[0] as { label?: string; disabled?: boolean };
        check(`${tier} claim button label fits (${taken} taken)`, (button.label?.length ?? 0) <= 80, button.label ?? "");

        const full = spec.slots !== null && taken >= spec.slots;
        check(`${tier} button is ${full ? "disabled when full" : "live when open"}`, Boolean(button.disabled) === full);
    }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
