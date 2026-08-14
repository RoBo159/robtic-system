import { StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder, MessageFlags } from "discord.js";
import { PROJECT_FLOW_MESSAGES } from "@constants";

const TEXT_MODALS = {
    tutorial: { modalPrefix: "modal_tutorial_", inputId: "tutorial_link", style: TextInputStyle.Short, copy: PROJECT_FLOW_MESSAGES.editModals.tutorial },
    additional_link: { modalPrefix: "modal_link_", inputId: "extra_link", style: TextInputStyle.Short, copy: PROJECT_FLOW_MESSAGES.editModals.link },
    env: { modalPrefix: "modal_env_", inputId: "env_info", style: TextInputStyle.Paragraph, copy: PROJECT_FLOW_MESSAGES.editModals.env },
} as const;

export default {
    customId: /^project_edit_.*$/,
    async run(interaction: StringSelectMenuInteraction) {
        const pendingId = interaction.customId.replace("project_edit_", "");
        const value = interaction.values[0];

        if (!value) {
            await interaction.reply({ content: PROJECT_FLOW_MESSAGES.selectAnOption, flags: MessageFlags.Ephemeral });
            return;
        }

        if (value === "image") {
            const copy = PROJECT_FLOW_MESSAGES.editModals.image;
            const modal = new ModalBuilder()
                .setCustomId(`modal_image_${pendingId}`)
                .setTitle(copy.title);

            const label = new LabelBuilder()
                .setLabel(copy.label)
                .setDescription(copy.description)
                .setFileUploadComponent(new FileUploadBuilder().setCustomId("image_upload"));

            modal.addLabelComponents(label);
            await interaction.showModal(modal);
            return;
        }

        const config = TEXT_MODALS[value as keyof typeof TEXT_MODALS];
        if (!config) {
            await interaction.reply({ content: PROJECT_FLOW_MESSAGES.unknownEditOption, flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`${config.modalPrefix}${pendingId}`)
            .setTitle(config.copy.title);

        const input = new TextInputBuilder()
            .setCustomId(config.inputId)
            .setStyle(config.style)
            .setPlaceholder(config.copy.placeholder)
            .setRequired(false);

        const label = new LabelBuilder()
            .setLabel(config.copy.label)
            .setDescription(config.copy.description)
            .setTextInputComponent(input);

        modal.addLabelComponents(label);
        await interaction.showModal(modal);
    }
};
