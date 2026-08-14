import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { addToCart } from "../utils/cart-store";

export default {
    customId: "ads-select-addon",

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = await AdsConfigRepository.get(interaction.guildId!);
        const items = interaction.values
            .map(key => AdsConfigRepository.findItem(config, "addons", key))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (!items.length) {
            await interaction.editReply({ content: "❌ These add-ons no longer exist." });
            return;
        }

        for (const item of items) {
            addToCart(interaction.user.id, { section: "addons", key: item.key, name: item.name, priceUsd: item.priceUsd });
        }
        const names = items.map(i => `**${i.name}**`).join("، ");

        await interaction.editReply({
            content: `✅ تمت إضافة ${names} إلى سلتك.`,
        });
    },
};
