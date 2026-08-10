import { LabelBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, type ChatInputCommandInteraction } from "discord.js";
import { PROJECT_SHARE_MODAL } from "@constants";
import { PROJECT_MODAL_FIELDS } from "./modal-fields";
import { buildModalComponent } from "./build-modal-component";

export async function showShareProjectModal(interaction: ChatInputCommandInteraction) {
    const modal = new ModalBuilder()
        .setCustomId(PROJECT_SHARE_MODAL.customId)
        .setTitle(PROJECT_SHARE_MODAL.title);

    for (const field of PROJECT_MODAL_FIELDS) {
        const input = buildModalComponent(field);

        const label = new LabelBuilder()
            .setLabel(field.title)
            .setDescription(field.description);

        if (input && field.type === "text") label.setTextInputComponent(input as TextInputBuilder);
        if (input && field.type === "menu") label.setStringSelectMenuComponent(input as StringSelectMenuBuilder);

        modal.addLabelComponents(label);
    }

    await interaction.showModal(modal);
}
