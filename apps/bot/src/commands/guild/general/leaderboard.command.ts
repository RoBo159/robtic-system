import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import { ActivityRepository } from "@database/repositories";
import { COLORS } from "@constants";
import { calculateLevel } from "@bot/services/community/xp";

export default {
    scope: "guild",
    access: "general",
    category: "Leveling",
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the XP leaderboard")
        .addIntegerOption(option =>
            option
                .setName("page")
                .setDescription("Page number")
                .setMinValue(1)
        ),

    async run(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const page = interaction.options.getInteger("page") ?? 1;
        const perPage = 10;
        const guildId = interaction.guildId!;

        const top = await ActivityRepository.getLeaderboard(guildId, perPage * page);
        const pageData = top.slice((page - 1) * perPage);

        if (pageData.length === 0) {
            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({ content: "No data for this page.", flags: MessageFlags.Ephemeral });
            return;
        }

        const lines = pageData.map((user, i) => {
            const rank = (page - 1) * perPage + i + 1;
            const lvl = calculateLevel(user.totalXP);
            return `**${rank}.** <@${user.discordId}> — Level ${lvl} | ${user.totalXP} XP`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🏆 XP Leaderboard")
            .setDescription(lines.join("\n"))
            .setColor(COLORS.activity)
            .setFooter({ text: `Page ${page}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
