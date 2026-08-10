import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { buildRulesContainer } from "../utils/ads-panels";

export default {
    customId: "ads-rules-view",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.reply({
            ...buildRulesContainer(),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
    },
};
