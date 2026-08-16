import type { FeatureSubcommandHandler } from "@typings/feature";
import { QUEST_TIER_SPECS, type QuestTier } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

/**
 * Turns one difficulty on or off for this guild.
 *
 * Only affects generation. Quests of a disabled tier that are already live keep running to their
 * end, because members have claimed them and paying out is not optional.
 */
export const tierToggle: FeatureSubcommandHandler = async (interaction, _client) => {
    const tier = interaction.options.getString("type", true) as QuestTier;
    const enabled = interaction.options.getBoolean("enabled", true);

    await QuestSettingsRepository.setTierEnabled(interaction.guildId!, tier, enabled);

    const spec = QUEST_TIER_SPECS[tier];
    const cadence = spec.dailyCount
        ? `${spec.dailyCount.min}–${spec.dailyCount.max} per day`
        : spec.weeklyCount
            ? `${spec.weeklyCount.min}–${spec.weeklyCount.max} per week`
            : "one per generation window";

    const slots = spec.slots === null ? "unlimited claims" : `${spec.slots} claim slot(s)`;

    await interaction.editReply({
        content: enabled
            ? `${tierTitle(tier)} quests are on — ${cadence}, ${spec.missions} mission(s), ` +
              `${spec.reward.toLocaleString()} points, ${slots}.`
            : `${tierTitle(tier)} quests are off. Any that are already live will finish normally.`,
    });
};
