import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from "discord.js";

export default {
    customId: /^review_(accept|refuse)_.*$/,
    async run(interaction: ButtonInteraction) {
        if(!interaction.isButton()) return;
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const pendingId = parts.slice(2).join("_");

        const modal = new ModalBuilder()
            .setCustomId(`modal_review_${action}_${pendingId}`)
            .setTitle(action === "accept" ? "Accept Project" : "Refuse Project");

        const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const reasonLabel = new LabelBuilder()
            .setLabel("Reason")
            .setDescription("Sent to the user")
            .setTextInputComponent(reasonInput);

        modal.addLabelComponents(reasonLabel);
        await interaction.showModal(modal);
    }
}
