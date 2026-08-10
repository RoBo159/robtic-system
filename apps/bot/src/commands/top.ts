import { SlashCommandBuilder, ChatInputCommandInteraction, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { buildTopCategoryRow, buildTopPeriodRow } from "../utils/top-controls";
import { buildTopEmbed } from "../services/top";
import { getUserLang, t } from "@bot/utils/lang";

export default {
    category: "Leaderboard",
    data: new SlashCommandBuilder()
        .setName("top")
        .setDescription("View the top 5 members for streak, combo, XP, or messages"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply();

        const guild = interaction.guild;
        const lang = await getUserLang(interaction.member as GuildMember | null);
        if (!guild) {
            await interaction.editReply({ content: t("combo.guild_only", lang) });
            return;
        }

        const category = "streak" as const;
        const period = "daily" as const;

        const embed = await buildTopEmbed(guild, category, period, lang, interaction.user.id);

        await interaction.editReply({
            embeds: [embed],
            components: [
                buildTopCategoryRow(interaction.user.id, category, period, lang),
                buildTopPeriodRow(interaction.user.id, category, period, lang),
            ],
        });
    },
};
