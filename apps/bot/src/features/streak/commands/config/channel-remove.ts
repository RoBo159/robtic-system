import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakSettingsRepository } from "@database/repositories";

export const channelRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const channel = interaction.options.getChannel("channel", true);
    await StreakSettingsRepository.removeChannel(interaction.guildId!, channel.id);
    await interaction.editReply({ content: `تمت إزالة <#${channel.id}> من قنوات التتابع.` });
};
