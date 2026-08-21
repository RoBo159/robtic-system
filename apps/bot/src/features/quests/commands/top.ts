import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_MESSAGES } from "@constants";
import { QuestStatsRepository } from "@database/repositories";

const LIMIT = 10;

/** Members with the most completed quests, plus where the caller sits if they missed the cut. */
export const top: FeatureSubcommandHandler = async (interaction, _client) => {
    const text = QUEST_MESSAGES.top;
    const guildId = interaction.guildId!;
    const rows = await QuestStatsRepository.getTop(guildId, LIMIT);

    if (rows.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(text.title)
                .setColor(COLORS.info)
                .setDescription(text.empty)],
        });
        return;
    }

    const lines = rows.map((row, index) =>
        text.row(text.medals[index] ?? text.fallbackMedal(index), row.discordId, row.completed, row.pointsEarned)
    );

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(COLORS.activity)
        .setDescription(lines.join("\n"));

    if (!rows.some(row => row.discordId === interaction.user.id)) {
        const rank = await QuestStatsRepository.getRank(guildId, interaction.user.id);
        embed.setFooter({ text: rank > 0 ? text.yourRank(rank) : text.unranked });
    }

    await interaction.editReply({ embeds: [embed] });
};
