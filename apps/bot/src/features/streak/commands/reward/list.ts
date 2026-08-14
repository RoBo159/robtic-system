import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakRewardRepository } from "@database/repositories";

export const list: FeatureSubcommandHandler = async (interaction, _client) => {
    const rewards = await StreakRewardRepository.list(interaction.guildId!);

    if (!rewards.length) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription("لا توجد مكافآت تتابع مُعدة بعد.")],
        });
        return;
    }

    const lines = rewards.map(r => `**${r.threshold}** يوم — ${r.offer}`).join("\n");
    await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("🎁 مكافآت التتابع").setDescription(lines).setColor(COLORS.info)],
    });
};
