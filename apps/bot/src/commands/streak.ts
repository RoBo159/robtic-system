import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { formatDuration } from "@utils";
import { getStreakSummary } from "../services/streak-service";
import { getUserLang, t } from "@bot/utils/lang";

export default {
    category: "Streak",
    data: new SlashCommandBuilder()
        .setName("streak")
        .setDescription("View your (or another member's) daily streak")
        .addUserOption(opt =>
            opt.setName("user").setDescription("The user to view (defaults to yourself)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply();

        const target = interaction.options.getUser("user") ?? interaction.user;
        const guildId = interaction.guildId!;
        const lang = await getUserLang(interaction.member as GuildMember | null);

        const summary = await getStreakSummary(target.id, guildId, target.username);
        const { record, rank, expiresInMs, nextClaimMs } = summary;

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
    },
};
