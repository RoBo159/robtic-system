import type { TextChannel } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { AdsConfigRepository } from "@database/repositories";

export const channel: FeatureSubcommandHandler = async (interaction, _client) => {
    const target = interaction.options.getChannel("channel", true) as TextChannel;
    await AdsConfigRepository.setApprovalChannel(interaction.guildId!, target.id);
    await interaction.editReply({ content: `✅ Ad orders will now be sent to ${target} for approval.` });
};
