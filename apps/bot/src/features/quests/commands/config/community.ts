import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_COMMUNITY_MESSAGES, QUEST_CONFIG_MESSAGES } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

const TEXT = QUEST_CONFIG_MESSAGES.community;

/**
 * Weekly challenge settings. Omitted options are left alone.
 *
 * Only affects challenges opened from here on: a running week keeps the reward and floor it was
 * announced with, because members have been contributing against those numbers all week and the
 * challenge document stores its own copy for exactly that reason.
 */
export const communitySettings: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const current = await QuestSettingsRepository.getCached(guildId);

    const enabled = interaction.options.getBoolean("enabled") ?? current.communityEnabled;
    const reward = interaction.options.getInteger("reward") ?? current.communityRewardBase;
    const minimum = interaction.options.getInteger("minimum") ?? current.communityMinContribution;

    await QuestSettingsRepository.setCommunity(guildId, enabled, reward, minimum);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(TEXT.title)
            .setColor(enabled ? COLORS.success : COLORS.warning)
            // The rank bonus comes from the panel's own copy, so the two cannot drift apart.
            .setDescription(TEXT.description(enabled, reward, minimum, QUEST_COMMUNITY_MESSAGES.rankBonus))
            .setFooter({ text: TEXT.footer })],
    });
};
