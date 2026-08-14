import { MessageFlags } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { Logger } from "@logger";
import { AdsConfigRepository } from "@database/repositories";
import { buildConfigRoot } from "../utils/ads-config-views";

export const config: FeatureSubcommandHandler = async (interaction, _client) => {
    try {
        const current = await AdsConfigRepository.get(interaction.guildId!);
        await interaction.editReply({ ...buildConfigRoot(current), flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
        Logger.error(`Failed to open the ads config panel: ${err}`, "ads");
        await interaction.editReply({ content: "❌ Something went wrong." }).catch(() => null);
    }
};
