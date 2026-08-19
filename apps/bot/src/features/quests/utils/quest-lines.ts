import type { IQuestClaimMission } from "@database/models";
import { QUEST_MESSAGES, type QuestTier } from "@constants";

const BAR_WIDTH = 10;

/** "🟢 Easy" — the one place a tier turns into display text, so every surface spells it the same. */
export const tierTitle = (tier: QuestTier): string => QUEST_MESSAGES.tierTitle(tier);

/** Same block characters as the community bar, ten wide because these sit in a stacked list. */
export function miniBar(fraction: number): string {
    const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round(fraction * BAR_WIDTH)));
    return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

/**
 * One line per mission, with where the member has got to.
 *
 * Progress is read straight off the claim rather than the in-memory buffer: a command reply is not
 * a hot path, and the stored number is the one that will actually be checked at completion. Up to
 * one flush interval of very recent activity is missing, which is invisible next to being wrong.
 */
export function missionProgressLines(
    missions: readonly IQuestClaimMission[],
    progress: Record<string, number> | undefined,
): string[] {
    return missions.map((mission, index) => {
        const value = Math.min(mission.target, progress?.[mission.missionId] ?? 0);
        const fraction = mission.target > 0 ? value / mission.target : 0;

        return QUEST_MESSAGES.missionLine(
            index,
            mission.label,
            miniBar(fraction),
            value,
            mission.target,
            value >= mission.target,
        );
    });
}
