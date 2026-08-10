import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";

const appealNote: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_note_[A-Za-z0-9-]+_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const caseId = parts[2];
        const userId = parts[3];

        const modal = new ModalBuilder()
            .setCustomId(`appeal_note_submit_${caseId}_${userId}`)
            .setTitle("Add Note")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("note_content")
                        .setLabel("Note")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ),
            );

        await interaction.showModal(modal);
    },
};

export default appealNote;
