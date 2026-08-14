import {
    ModalSubmitInteraction,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { NoteRepository } from "@database/repositories/NoteRepository";

const noteCreate: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^note_create_\d+$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.customId.replace("note_create_", "");
        const content = interaction.fields.getTextInputValue("note_content");

        await NoteRepository.create(userId, content, interaction.user.id);

        await interaction.editReply({
            content: `✅ Note added for <@${userId}>.`,
        });
    },
};

export default noteCreate;
