import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, STREAK_CONFIG } from "@constants";
import { formatDuration } from "@utils";
import { StreakSettingsRepository } from "@database/repositories";

/** Views the guild's streak settings, updating min-length first when that option was supplied. */
export const settings: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const minLength = interaction.options.getInteger("min-length");

    let config = await StreakSettingsRepository.getOrCreate(guildId);
    if (minLength !== null) {
        config = await StreakSettingsRepository.setMinMessageLength(guildId, minLength);
    }

    const embed = new EmbedBuilder()
        .setTitle("إعدادات التتابع")
        .addFields(
            { name: "القنوات", value: config.channels.length ? config.channels.map(id => `<#${id}>`).join(", ") : "لا يوجد" },
            { name: "التذكيرات", value: config.remindersEnabled ? "مفعّل" : "معطّل", inline: true },
            { name: "الحد الأدنى لطول الرسالة", value: `${config.minMessageLength}`, inline: true },
            { name: "مدة الحصول على التتابع", value: formatDuration(STREAK_CONFIG.claimWindowMs), inline: true },
            { name: "مدة انتهاء الصلاحية", value: formatDuration(STREAK_CONFIG.expireWindowMs), inline: true },
            { name: "حد التذكير", value: formatDuration(STREAK_CONFIG.reminderThresholdMs), inline: true },
            { name: "مدة الاسترجاع", value: formatDuration(STREAK_CONFIG.recoveryWindowMs), inline: true },
        )
        .setColor(COLORS.info)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
};
