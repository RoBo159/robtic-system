import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakRepository } from "@database/repositories";

/**
 * Copies streaks in from another server the bot is in.
 *
 * Confirmation is a separate button rather than an option flag because the merge is bulk and
 * irreversible — the count in the prompt is the only chance to notice a wrong source guild.
 */
export const sync: FeatureSubcommandHandler = async (interaction, client) => {
    const guildId = interaction.guildId!;
    const sourceGuildId = interaction.options.getString("source-guild-id", true).trim();

    if (sourceGuildId === guildId) {
        await interaction.editReply({ content: "لا يمكن مزامنة السيرفر مع نفسه." });
        return;
    }

    const sourceGuild = client.guilds.cache.get(sourceGuildId);
    if (!sourceGuild) {
        await interaction.editReply({ content: "البوت غير موجود في السيرفر المصدر." });
        return;
    }

    const count = await StreakRepository.countGuild(sourceGuildId);
    if (count === 0) {
        await interaction.editReply({ content: `لا يوجد أي تتابعات في **${sourceGuild.name}**.` });
        return;
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`streak-sync-confirm_${interaction.user.id}_${sourceGuildId}`)
            .setLabel("تأكيد المزامنة")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`streak-sync-cancel_${interaction.user.id}`)
            .setLabel("إلغاء")
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("⚠️ تأكيد مزامنة التتابع")
            .setColor(COLORS.warning)
            .setDescription(
                `سيتم نسخ **${count}** تتابع من **${sourceGuild.name}** إلى هذا السيرفر.\n` +
                `عند تعارض البيانات سيتم الاحتفاظ بالقيمة الأعلى، وسيتم تحديث أدوار التتابع تلقائيًا.`
            )],
        components: [row],
    });
};
