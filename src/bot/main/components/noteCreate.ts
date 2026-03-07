import {
    ModalSubmitInteraction,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { NoteRepository } from "@database/repositories/NoteRepository";

const noteCreate: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^note_create_\d+$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const userId = interaction.customId.replace("note_create_", "");
        const content = interaction.fields.getTextInputValue("note_content");

        await NoteRepository.create(userId, content, interaction.user.id);

        await interaction.reply({
            content: `✅ Note added for <@${userId}>.`,
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default noteCreate;
