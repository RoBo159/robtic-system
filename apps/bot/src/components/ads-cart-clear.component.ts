import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { clearCart, getCart } from "../utils/cart-store";
import { buildCartSummary } from "../utils/ads-panels";

export default {
    customId: "ads-cart-clear",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        clearCart(interaction.user.id);
        const config = await AdsConfigRepository.get(interaction.guildId!);

        await interaction.editReply({
            ...buildCartSummary(getCart(interaction.user.id), config.exchangeRate, "🗑️ Cart cleared."),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
