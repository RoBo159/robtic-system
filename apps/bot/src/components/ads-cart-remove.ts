import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { getCart, removeFromCart } from "../utils/cart-store";
import { buildCartSummary } from "../utils/ads-panels";

export default {
    customId: /^ads-cart-remove_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const index = Number(interaction.customId.slice("ads-cart-remove_".length));
        removeFromCart(interaction.user.id, index);

        const config = await AdsConfigRepository.get(interaction.guildId!);
        await interaction.editReply({
            ...buildCartSummary(getCart(interaction.user.id), config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
