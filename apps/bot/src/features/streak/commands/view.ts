import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { formatDuration } from "@utils";
import { getUserLang, t } from "@bot/utils/lang";
import { getStreakSummary } from "../lib";

export const view: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;
    const lang = await getUserLang(interaction.member as GuildMember | null);

    const { record, rank, expiresInMs, nextClaimMs } = await getStreakSummary(target.id, guildId, target.username);

    const unranked = t("streak.unranked", lang);
    const notAvailable = t("streak.not_available", lang);

    const embed = new EmbedBuilder()
        .setTitle(t("streak.title", lang, { username: target.username }))
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setColor(record.active ? COLORS.activity : COLORS.info)
        .addFields(
            { name: t("streak.current_streak", lang), value: `🔥 ${record.currentStreak}`, inline: true },
            { name: t("streak.best_streak", lang), value: `🏆 ${record.bestStreak}`, inline: true },
            { name: t("streak.rank", lang), value: rank > 0 ? `📈 #${rank}` : unranked, inline: true },
            { name: t("streak.next_claim", lang), value: nextClaimMs > 0 ? `⏳ ${formatDuration(nextClaimMs)}` : t("streak.available_now", lang), inline: true },
            { name: t("streak.expires_in", lang), value: expiresInMs !== null ? `💔 ${formatDuration(expiresInMs)}` : notAvailable, inline: true },
            { name: t("streak.reminder_status", lang), value: record.active ? (record.reminderSent ? t("streak.reminder_sent", lang) : t("streak.reminder_pending", lang)) : notAvailable, inline: true },
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
};
