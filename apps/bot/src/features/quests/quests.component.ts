import type { FeatureComponentIndex } from "@typings/feature";
import { registerProfileTab } from "@core/profile";
import { getQuestSummary } from "@core/quests";
import questClaimHandler from "./components/claim-button";
import { buildQuestStatsEmbed } from "./utils/quest-stats-embed";

/**
 * Quests contribute their `/profile` tab rather than profile importing from here, so the dependency
 * points outwards and deleting this folder takes the tab with it. Registration happens on import,
 * which the loader does for every `*.component.ts`.
 */
registerProfileTab({
    key: "quests",
    feature: "quests",
    render: async (guild, target) => {
        const summary = await getQuestSummary(guild.id, target.id);
        return buildQuestStatsEmbed(summary, target, true);
    },
});

export default {
    feature: "quests",
    handlers: [questClaimHandler],
} satisfies FeatureComponentIndex;
