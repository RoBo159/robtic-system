import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

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
            .setTitle("Weekly community challenge")
            .setColor(enabled ? COLORS.success : COLORS.warning)
            .setDescription(
                `**Running:** ${enabled ? "yes, a new one opens each week" : "no"}\n` +
                `**Base reward:** ${reward.toLocaleString()} points per qualifying contributor\n` +
                `**Minimum contribution:** ${minimum.toLocaleString()}\n` +
                "**Rank bonus:** 🥇 ×3 · 🥈🥉 ×2 · 4th–5th ×1.5"
            )
            .setFooter({ text: "A challenge already under way keeps the numbers it started with." })],
    });
};
