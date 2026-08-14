import {
    LabelBuilder,
    ModalBuilder,
    MessageFlags,
    TextInputBuilder,
    TextInputStyle,
    type StringSelectMenuInteraction,
} from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TicketRepository } from "@database/repositories";
import { findCategory } from "../../utils/moderation/ticket-guard";

function buildSubjectModal(categoryId: string): ModalBuilder {
    const subjectInput = new TextInputBuilder()
        .setCustomId("ticket_subject")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Short description...")
        .setMinLength(15)
        .setMaxLength(80)
        .setRequired(true);

    const subjectLabel = new LabelBuilder()
        .setLabel("Enter the subject:")
        .setTextInputComponent(subjectInput);

    return new ModalBuilder()
        .setCustomId(`ticket_open_modal_${categoryId}`)
        .setTitle("Open a Ticket")
        .addLabelComponents([subjectLabel]);
}

export const ticketPanelSelectHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: "ticket_panel_select",

    async run(interaction: StringSelectMenuInteraction) {
        const categoryId = interaction.values[0];
        const category = findCategory(categoryId);
        if (!category) {
            await interaction.reply({ content: "This category is no longer available.", flags: MessageFlags.Ephemeral });
            return;
        }

        const existing = await TicketRepository.findOpenByUser(interaction.user.id, interaction.guildId!);
        if (existing.length > 0) {
            await interaction.reply({
                content: `You already have an open ticket: <#${existing[0].channelId}>`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.showModal(buildSubjectModal(categoryId));
    },
};
