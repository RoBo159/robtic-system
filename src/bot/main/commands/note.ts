import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/BotClient";

export default {
    data: new SlashCommandBuilder()
        .setName("note")
        .setDescription("Add a note about a user")
        .addUserOption(opt =>
            opt.setName("user").setDescription("The user to add a note for").setRequired(true)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const targetUser = interaction.options.getUser("user", true);

        const modal = new ModalBuilder()
            .setCustomId(`note_create_${targetUser.id}`)
            .setTitle(`Add Note: ${targetUser.username}`);

        const contentInput = new TextInputBuilder()
            .setCustomId("note_content")
            .setLabel("Note")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Write your note about this user...")
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
        );

        await interaction.showModal(modal);
    },
};
