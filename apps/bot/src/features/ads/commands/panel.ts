import { MessageFlags, type TextChannel } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { AdsConfigRepository } from "@database/repositories";
import { buildAdsPanel } from "../utils/ads-panels";

export const panel: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const config = await AdsConfigRepository.get(guildId);
    const target = interaction.channel as TextChannel;

    const { components, files } = buildAdsPanel(config);
    const message = await target.send({ components, files, flags: MessageFlags.IsComponentsV2 });

    await AdsConfigRepository.setPanel(guildId, target.id, message.id);
    await interaction.editReply({ content: `✅ Ads panel posted in ${target}.` });
};
