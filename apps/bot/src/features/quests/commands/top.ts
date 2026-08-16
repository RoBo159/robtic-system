import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { QuestStatsRepository } from "@database/repositories";

const MEDALS = ["🥇", "🥈", "🥉"];
const LIMIT = 10;

/** Members with the most completed quests, plus where the caller sits if they missed the cut. */
export const top: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const rows = await QuestStatsRepository.getTop(guildId, LIMIT);

    if (rows.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("🏆 Quest leaderboard")
                .setColor(COLORS.info)
                .setDescription("Nobody has completed a quest here yet. Be the first.")],
        });
        return;
    }

    const lines = rows.map((row, index) =>
        `${MEDALS[index] ?? `\`#${index + 1}\``} <@${row.discordId}> — **${row.completed.toLocaleString()}** completed · ` +
        `🎯 ${row.pointsEarned.toLocaleString()}`
    );

    const embed = new EmbedBuilder()
        .setTitle("🏆 Quest leaderboard")
        .setColor(COLORS.activity)
        .setDescription(lines.join("\n"));

    // Only worth a query when they are not already on the board.
    if (!rows.some(row => row.discordId === interaction.user.id)) {
        const rank = await QuestStatsRepository.getRank(guildId, interaction.user.id);
        embed.setFooter({ text: rank > 0 ? `You are #${rank}` : "You are not ranked yet" });
    }

    await interaction.editReply({ embeds: [embed] });
};
