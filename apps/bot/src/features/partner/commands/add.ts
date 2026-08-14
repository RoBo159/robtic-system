import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";

const field = (id: string, label: string, style: TextInputStyle, required: boolean, maxLength: number) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength)
    );

export const add: FeatureSubcommandHandler = async (interaction, _client) => {
    const modal = new ModalBuilder().setCustomId("partner_add_modal").setTitle("Add Partner");

    modal.addComponents(
        field("partner_server_id", "Partner Server ID", TextInputStyle.Short, true, 32),
        field("partner_server_name", "Partner Server Name", TextInputStyle.Short, true, 100),
        field("partner_rep_id", "Representative User ID", TextInputStyle.Short, true, 32),
        field("partner_description", "Description", TextInputStyle.Paragraph, true, 500),
        field("partner_invite", "Invite Link (optional)", TextInputStyle.Short, false, 200),
    );

    await interaction.showModal(modal);
};
