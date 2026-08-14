import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakRewardRepository } from "@database/repositories";

export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const number = interaction.options.getInteger("number", true);
    const removed = await StreakRewardRepository.remove(guildId, number);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(removed ? COLORS.success : COLORS.error)
            .setDescription(removed ? `✅ تمت إزالة مكافأة **${number}** يوم.` : `❌ لا توجد مكافأة عند **${number}** يوم.`)],
    });
};
