import type { FeatureSubcommandHandler } from "@typings/feature";
import { buildVoiceEmbed } from "../utils/build-voice-embed";

export const stats: FeatureSubcommandHandler = async (interaction, _client) => {
    const user = interaction.options.getUser("user") ?? interaction.user;
    await interaction.editReply({ embeds: [await buildVoiceEmbed(interaction.guild!, user)] });
};
