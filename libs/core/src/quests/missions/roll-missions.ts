import type { QuestTier } from "@constants";
import { templatesForTier } from "./registry";
import type { GeneratedMission } from "./types";

/**
 * Picks and freezes the missions for one quest.
 *
 * Distinct templates wherever possible — two "send N messages" objectives on the same quest is one
 * objective wearing a hat. If the tier has fewer eligible templates than it wants missions, it gets
 * what exists rather than duplicates, so a thin registry degrades to a shorter quest instead of a
 * silly one.
 *
 * `random` is injected so generation can seed it and produce the same quest on a retry.
 */
export function rollMissions(tier: QuestTier, count: number, random: () => number): GeneratedMission[] {
    const pool = templatesForTier(tier);
    if (pool.length === 0) return [];

    // Fisher-Yates over a copy, driven by the supplied source.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }

    return shuffled.slice(0, Math.min(count, shuffled.length)).map((template, index) => {
        const target = Math.max(1, Math.round(template.targetFor(tier)));

        return {
            missionId: `m${index + 1}`,
            templateKey: template.key,
            metric: template.metric,
            accumulation: template.accumulation,
            target,
            label: template.label(target),
        };
    });
}
