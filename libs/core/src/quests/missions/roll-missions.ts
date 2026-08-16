import type { QuestTier } from "@constants";
import { templatesForTier } from "./registry";
import { shuffle } from "../generation/random";
import type { GeneratedMission } from "./types";

/**
 * Picks and freezes the missions for one quest.
 *
 * Distinct templates wherever possible — two "send N messages" objectives on the same quest is one
 * objective wearing a hat. If the tier has fewer eligible templates than it wants missions, it gets
 * what exists rather than duplicates, so a thin registry degrades to a shorter quest instead of a
 * silly one.
 *
 * Genuinely random, and safe to be: the result is written onto the quest document as it is
 * created, so nobody ever needs to reproduce this roll. Two quests of the same tier on the same day
 * get different objectives.
 */
export function rollMissions(tier: QuestTier, count: number): GeneratedMission[] {
    const pool = templatesForTier(tier);
    if (pool.length === 0) return [];

    const shuffled = shuffle([...pool]);

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
