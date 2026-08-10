import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import type { AdSection } from "@database/models/AdsConfig";
import { buildItemDetail } from "../utils/ads-config-views";

export default {
    customId: "ads-config-select-item",

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const [section, key] = interaction.values[0].split(":") as [AdSection, string];
        const config = await AdsConfigRepository.get(interaction.guildId!);
        const item = AdsConfigRepository.findItem(config, section, key);

        if (!item) {
            await interaction.followUp({ content: "❌ This item no longer exists.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.editReply({
            ...buildItemDetail(section, item, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
