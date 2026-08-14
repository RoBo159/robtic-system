import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { buildPackageDetail } from "../utils/ads-panels";

export default {
    customId: /^ads-pack_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const key = interaction.customId.slice("ads-pack_".length);
        const config = await AdsConfigRepository.get(interaction.guildId!);
        const item = AdsConfigRepository.findItem(config, "packages", key);

        if (!item) {
            await interaction.editReply({ content: "❌ This package no longer exists." });
            return;
        }

        await interaction.editReply({
            ...buildPackageDetail(item, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
