import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakSettingsRepository } from "@database/repositories";

export const channelAdd: FeatureSubcommandHandler = async (interaction, _client) => {
    const channel = interaction.options.getChannel("channel", true);
    await StreakSettingsRepository.addChannel(interaction.guildId!, channel.id);
    await interaction.editReply({ content: `تمت إضافة <#${channel.id}> كقناة للتتابع.` });
};
