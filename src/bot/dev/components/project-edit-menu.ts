import { StringSelectMenuInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder, MessageFlags } from "discord.js";

export default {
    customId: /^project_edit_.*$/,
    async run(interaction: StringSelectMenuInteraction) {
        const pendingId = interaction.customId.replace("project_edit_", "");
        const value = interaction.values[0];

        if (!value) {
            await interaction.reply({ content: "Please select an option.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (value === "tutorial") {
            const modal = new ModalBuilder()
                .setCustomId(`modal_tutorial_${pendingId}`)
                .setTitle("YouTube Tutorial");

            const input = new TextInputBuilder()
                .setCustomId("tutorial_link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://youtube.com/...")
                .setRequired(false);

            const label = new LabelBuilder()
                .setLabel("YouTube Link")
                .setDescription("Leave empty to remove")
                .setTextInputComponent(input);

            modal.addLabelComponents(label);
            await interaction.showModal(modal);
            return;

        } else if (value === "additional_link") {
            const modal = new ModalBuilder()
                .setCustomId(`modal_link_${pendingId}`)
                .setTitle("Additional or Github Link");

            const input = new TextInputBuilder()
                .setCustomId("extra_link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://...")
                .setRequired(false);

            const label = new LabelBuilder()
                .setLabel("URL Link")
                .setDescription("Leave empty to remove")
                .setTextInputComponent(input);

            modal.addLabelComponents(label);
            await interaction.showModal(modal);
            return;

        } else if (value === "env") {
            const modal = new ModalBuilder()
                .setCustomId(`modal_env_${pendingId}`)
                .setTitle(".env Info");

            const input = new TextInputBuilder()
                .setCustomId("env_info")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("KEY=VALUE")
                .setRequired(false);

            const label = new LabelBuilder()
                .setLabel(".env Information")
                .setDescription("Leave empty to remove")
                .setTextInputComponent(input);

            modal.addLabelComponents(label);
            await interaction.showModal(modal);
            return;

        } else if (value === "image") {
            const modal = new ModalBuilder()
                .setCustomId(`modal_image_${pendingId}`)
                .setTitle("Upload Image");
                
            const fileUpload = new FileUploadBuilder().setCustomId("image_upload");
            const label = new LabelBuilder()
                .setLabel("Project Image")
                .setDescription("Upload a screenshot (leave empty to skip)")
                .setFileUploadComponent(fileUpload);
                
            modal.addLabelComponents(label);
            await interaction.showModal(modal);
            return;
        } else {
            await interaction.reply({ content: "Unknown project edit option.", flags: MessageFlags.Ephemeral });
            return;
        }
    }
}
