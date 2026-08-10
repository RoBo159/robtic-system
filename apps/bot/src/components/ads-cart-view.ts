import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { getCart } from "../utils/cart-store";
import { buildCartSummary } from "../utils/ads-panels";

export default {
    customId: "ads-cart-view",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = await AdsConfigRepository.get(interaction.guildId!);
        const cart = getCart(interaction.user.id);

        await interaction.editReply({
            ...buildCartSummary(cart, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
