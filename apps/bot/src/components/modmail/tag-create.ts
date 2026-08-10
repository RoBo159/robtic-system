import {
    ModalSubmitInteraction,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { TagRepository } from "@database/repositories/TagRepository";
import messages from "../../utils/modmail/messages.json";

const tagCreate: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^tag_create$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const key = interaction.fields.getTextInputValue("tag_key").toLowerCase().trim();
        const description = interaction.fields.getTextInputValue("tag_description").trim();
        const content = interaction.fields.getTextInputValue("tag_content");
        const contentAr = interaction.fields.getTextInputValue("tag_content_ar");

        const existing = await TagRepository.findByKey(key);
        if (existing) {
            await interaction.editReply({
                content: messages.errors.tag_already_exists.replace("{key}", key),
            });
            return;
        }

        await TagRepository.create(key, description, { en: content, ar: contentAr }, interaction.user.id);

        await interaction.editReply({
            content: messages.success.tag_created.replace(/\{key\}/g, key),
        });
    },
};

export default tagCreate;
