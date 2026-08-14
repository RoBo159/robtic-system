import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";

export const announce: FeatureSubcommandHandler = async (interaction, _client) => {
    const modal = new ModalBuilder().setCustomId("partner_announce_modal").setTitle("Announce to Partners");

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("announce_title").setLabel("Title").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("announce_message").setLabel("Message").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
        )
    );

    await interaction.showModal(modal);
};
