import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakSettingsRepository } from "@database/repositories";

export const reminderDefault: FeatureSubcommandHandler = async (interaction, _client) => {
    const enabled = interaction.options.getBoolean("enabled", true);
    await StreakSettingsRepository.setRemindersEnabled(interaction.guildId!, enabled);
    await interaction.editReply({ content: `أصبحت تذكيرات انتهاء التتابع الآن **${enabled ? "مفعّلة" : "معطّلة"}**.` });
};
