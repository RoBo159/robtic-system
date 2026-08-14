import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { buildAddonsSelector } from "../utils/ads-panels";

export default {
    customId: "ads-addons-view",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = await AdsConfigRepository.get(interaction.guildId!);

        await interaction.editReply({
            ...buildAddonsSelector(config),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
