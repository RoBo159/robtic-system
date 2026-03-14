import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
} from "discord.js";
import { ActivityRepository } from "@database/repositories";
import { Colors } from "@core/config";
import { calculateLevel } from "../services/xp-service";

export default {
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
        const page = interaction.options.getInteger("page") ?? 1;
        const perPage = 10;
        const guildId = interaction.guildId!;

        const top = await ActivityRepository.getLeaderboard(guildId, perPage * page);
        const pageData = top.slice((page - 1) * perPage);

        if (pageData.length === 0) {
            await interaction.reply({ content: "No data for this page.", ephemeral: true });
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
            .setColor(Colors.activity)
            .setFooter({ text: `Page ${page}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
