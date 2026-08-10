import { MessageFlags, type ButtonInteraction, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository, AdOrderRepository } from "@database/repositories";
import { clearCart, getCart, cartTotalUsd } from "../utils/cart-store";
import { buildCartSummary } from "../utils/ads-panels";
import { buildOrderReview } from "../utils/ads-order-review";

export default {
    customId: "ads-cart-confirm",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const guildId = interaction.guildId!;
        const cart = getCart(interaction.user.id);
        const config = await AdsConfigRepository.get(guildId);

        if (!cart.length) {
            await interaction.editReply({
                ...buildCartSummary(cart, config.exchangeRate, "❌ Your cart is empty — add something first."),
                flags: MessageFlags.IsComponentsV2,
            });
            return;
        }

        if (!config.approvalChannelId) {
            await interaction.editReply({
                ...buildCartSummary(cart, config.exchangeRate, "❌ The ads system isn't fully configured yet. Please contact an administrator."),
                flags: MessageFlags.IsComponentsV2,
            });
            return;
        }

        const reviewChannel = interaction.guild?.channels.cache.get(config.approvalChannelId) as TextChannel | undefined;
        if (!reviewChannel) {
            await interaction.editReply({
                ...buildCartSummary(cart, config.exchangeRate, "❌ The approval channel could not be found. Please contact an administrator."),
                flags: MessageFlags.IsComponentsV2,
            });
            return;
        }

        const totalUsd = cartTotalUsd(cart);
        const order = await AdOrderRepository.create(guildId, interaction.user.id, cart, totalUsd);

        const reviewMsg = await reviewChannel.send({
            ...buildOrderReview(order, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
        await AdOrderRepository.setReviewMessage(String(order._id), reviewMsg.id);

        clearCart(interaction.user.id);

        await interaction.editReply({
            ...buildCartSummary([], config.exchangeRate, "✅ Your order has been submitted! You'll be notified once staff review it."),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
