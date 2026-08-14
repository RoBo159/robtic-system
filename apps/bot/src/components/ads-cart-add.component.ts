import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import type { AdSection } from "@database/models/AdsConfig";
import { addToCart } from "../utils/cart-store";

export default {
    customId: /^ads-cart-add_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [, section, key] = interaction.customId.match(/^ads-cart-add_(\w+)_(.+)$/) ?? [];
        const config = await AdsConfigRepository.get(interaction.guildId!);
        const item = AdsConfigRepository.findItem(config, section as AdSection, key);

        if (!item) {
            await interaction.editReply({ content: "❌ This item no longer exists." });
            return;
        }

        addToCart(interaction.user.id, { section: section as AdSection, key: item.key, name: item.name, priceUsd: item.priceUsd });

        await interaction.editReply({
            content: `✅ تمت إضافة **${item.name}** إلى سلتك.`,
        });
    },
};
