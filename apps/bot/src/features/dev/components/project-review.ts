import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from "discord.js";
import { PROJECT_REVIEW_MESSAGES } from "@constants";

export default {
    customId: /^review_(accept|refuse)_.*$/,
    async run(interaction: ButtonInteraction) {
        if (!interaction.isButton()) return;
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const pendingId = parts.slice(2).join("_");

        const modal = new ModalBuilder()
            .setCustomId(`modal_review_${action}_${pendingId}`)
            .setTitle(action === "accept" ? PROJECT_REVIEW_MESSAGES.acceptModalTitle : PROJECT_REVIEW_MESSAGES.refuseModalTitle);

        const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const reasonLabel = new LabelBuilder()
            .setLabel(PROJECT_REVIEW_MESSAGES.reasonLabel)
            .setDescription(PROJECT_REVIEW_MESSAGES.reasonDescription)
            .setTextInputComponent(reasonInput);

        modal.addLabelComponents(reasonLabel);
        await interaction.showModal(modal);
    }
};
