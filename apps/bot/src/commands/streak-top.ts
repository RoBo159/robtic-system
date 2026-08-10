import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { getLeaderboard, buildLeaderboardEmbed, type LeaderboardMode } from "../services/streak-service";
import { getUserLang, t, type Lang } from "@bot/utils/lang";

export function buildStreakTopButtons(activeMode: LeaderboardMode, lang: Lang): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("streak-top-current")
            .setLabel(t("streakTop.button_current", lang))
            .setEmoji("🔥")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(activeMode === "current"),
        new ButtonBuilder()
            .setCustomId("streak-top-best")
            .setLabel(t("streakTop.button_best", lang))
            .setEmoji("🏆")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeMode === "best"),
    );
}

export default {
    category: "Streak",
    data: new SlashCommandBuilder()
        .setName("streak-top")
        .setDescription("View the top 5 daily streaks"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply();

        const guildId = interaction.guildId!;
        const lang = await getUserLang(interaction.member as GuildMember | null);
        const records = await getLeaderboard(guildId, "current");
        const embed = buildLeaderboardEmbed(interaction.guild!.name, "current", records, lang);

        await interaction.editReply({ embeds: [embed], components: [buildStreakTopButtons("current", lang)] });
    },
};
