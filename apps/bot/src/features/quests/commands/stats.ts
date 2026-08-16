import type { FeatureSubcommandHandler } from "@typings/feature";
import { getQuestSummary } from "@core/quests";
import { buildQuestStatsEmbed } from "../utils/quest-stats-embed";

/** A member's lifetime quest record in this guild. */
export const stats: FeatureSubcommandHandler = async (interaction, _client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const summary = await getQuestSummary(interaction.guildId!, target.id);

    await interaction.editReply({
        embeds: [buildQuestStatsEmbed(
            summary,
            { id: target.id, username: target.username, avatarUrl: target.displayAvatarURL() },
            target.id === interaction.user.id,
        )],
    });
};
