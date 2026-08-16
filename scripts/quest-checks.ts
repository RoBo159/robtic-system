/** Verifies the pure generation primitives — the parts that need no database. */
import { occasionRandom, randomInt } from "@core/quests/generation/seeded-random";
import { enumerateOccurrences, scheduledInstantFor, localWeekKey, localDateKey } from "@core/quests/generation/windows";
import { rollMissions } from "@core/quests/missions/roll-missions";
import "@core/quests/missions";
import { DEFAULT_QUEST_WINDOWS } from "@constants";

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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
