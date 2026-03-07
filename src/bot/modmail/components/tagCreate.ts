import {
    ModalSubmitInteraction,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { TagRepository } from "@database/repositories/TagRepository";
import messages from "../utils/messages.json";

const tagCreate: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^tag_create$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const key = interaction.fields.getTextInputValue("tag_key").toLowerCase().trim();
        const description = interaction.fields.getTextInputValue("tag_description").trim();
        const content = interaction.fields.getTextInputValue("tag_content");

        const existing = await TagRepository.findByKey(key);
        if (existing) {
            await interaction.reply({
                content: messages.errors.tag_already_exists.replace("{key}", key),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await TagRepository.create(key, description, content, interaction.user.id);

        await interaction.reply({
            content: messages.success.tag_created.replace(/\{key\}/g, key),
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default tagCreate;
