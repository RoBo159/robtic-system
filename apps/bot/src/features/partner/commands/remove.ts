import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";

export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const modal = new ModalBuilder().setCustomId("partner_remove_modal").setTitle("Remove Partner");

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("partner_server_id")
                .setLabel("Partner Server ID")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(32)
        )
    );

    await interaction.showModal(modal);
};
