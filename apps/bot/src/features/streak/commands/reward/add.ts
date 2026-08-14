import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakRewardRepository } from "@database/repositories";

export const add: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const number = interaction.options.getInteger("number", true);
    const offer = interaction.options.getString("offer", true);

    await StreakRewardRepository.add(guildId, number, offer, interaction.user.id);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(`✅ عند وصول العضو إلى **${number}** يوم تتابع سيحصل على: ${offer}`)],
    });
};
