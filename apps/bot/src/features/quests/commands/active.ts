import type { FeatureSubcommandHandler } from "@typings/feature";
import { buildActiveQuestsEmbed } from "../utils/active-quests-embed";

/** The quests this member is currently on. */
export const active: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.editReply({
        embeds: [await buildActiveQuestsEmbed(interaction.guildId!, interaction.user.id)],
    });
};
