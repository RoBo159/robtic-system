import type { FeatureSubcommandHandler } from "@typings/feature";
import { RejoinRolesConfigRepository } from "@database/repositories";
import { buildConfigEmbed } from "../utils/build-config-embed";

export const status: FeatureSubcommandHandler = async (interaction, _client) => {
    const config = await RejoinRolesConfigRepository.getCached(interaction.guildId!);
    await interaction.editReply({ embeds: [buildConfigEmbed(config)] });
};
