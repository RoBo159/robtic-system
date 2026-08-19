import type { FeatureSubcommandHandler } from "@typings/feature";
import { QUEST_CONFIG_MESSAGES, QUEST_TIER_SPECS, type QuestTier } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

const TEXT = QUEST_CONFIG_MESSAGES.tier;

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
        ? TEXT.cadenceDaily(spec.dailyCount.min, spec.dailyCount.max)
        : spec.weeklyCount
            ? TEXT.cadenceWeekly(spec.weeklyCount.min, spec.weeklyCount.max)
            : TEXT.cadencePerWindow;

    const slots = spec.slots === null ? TEXT.slotsUnlimited : TEXT.slots(spec.slots);

    await interaction.editReply({
        content: enabled
            ? TEXT.enabled(tierTitle(tier), cadence, spec.missions, spec.reward, slots)
            : TEXT.disabled(tierTitle(tier)),
    });
};
