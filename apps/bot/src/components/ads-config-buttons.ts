import {
    ActionRowBuilder,
    ButtonInteraction,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import type { AdSection } from "@database/models/AdsConfig";
import { buildConfigRoot } from "../utils/ads-config-views";

export default {
    customId: /^ads-config-(back$|rate$|edit_)/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const guildId = interaction.guildId!;

        if (interaction.customId === "ads-config-back") {
            await interaction.deferUpdate();
            const config = await AdsConfigRepository.get(guildId);
            await interaction.editReply({ ...buildConfigRoot(config), flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (interaction.customId === "ads-config-rate") {
            const config = await AdsConfigRepository.get(guildId);
            const modal = new ModalBuilder()
                .setCustomId("ads-config-rate-modal")
                .setTitle("Edit Exchange Rate")
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId("rate")
                            .setLabel("Credits per 1 USD")
                            .setStyle(TextInputStyle.Short)
                            .setValue(String(config.exchangeRate))
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
            return;
        }

        if (interaction.customId.startsWith("ads-config-edit_")) {
            const [, section, key] = interaction.customId.match(/^ads-config-edit_(\w+)_(.+)$/) ?? [];
            const config = await AdsConfigRepository.get(guildId);
            const item = AdsConfigRepository.findItem(config, section as AdSection, key);

            if (!item) {
                await interaction.reply({ content: "❌ This item no longer exists.", flags: MessageFlags.Ephemeral });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`ads-config-edit-modal_${section}_${key}`)
                .setTitle(`Edit: ${item.name}`.slice(0, 45))
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId("name")
                            .setLabel("Name")
                            .setStyle(TextInputStyle.Short)
                            .setValue(item.name)
                            .setMaxLength(100)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId("priceUsd")
                            .setLabel("Price (USD)")
                            .setStyle(TextInputStyle.Short)
                            .setValue(String(item.priceUsd))
                            .setRequired(true)
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId("details")
                            .setLabel("Details (duration, includes, notes...)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(item.details ?? "")
                            .setRequired(false)
                    )
                );
            await interaction.showModal(modal);
        }
    },
};
