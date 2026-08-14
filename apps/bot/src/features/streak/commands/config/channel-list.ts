import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakSettingsRepository } from "@database/repositories";

export const channelList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await StreakSettingsRepository.getOrCreate(interaction.guildId!);
    const list = settings.channels.length ? settings.channels.map(id => `<#${id}>`).join(", ") : "لا يوجد";

    await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("قنوات التتابع").setDescription(list).setColor(COLORS.info)],
    });
};
