import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import { Send } from "@database/models";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";

const createEmbedModal: ComponentHandler<ModalSubmitInteraction> = {
    customId: "create-embed",

    async run(interaction: ModalSubmitInteraction, client: BotClient) {

        if (!interaction.isModalSubmit()) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const title = interaction.fields.getTextInputValue("embed-title");
        const description = interaction.fields.getTextInputValue("embed-desc");

        const data = await Send.findOneAndDelete({
            user: interaction.user.id
        });

        if (!data) {
            await interaction.editReply({
                content: "⛔ Embed session expired or not found.",
            });
            return;
        }

        const channel = await interaction.guild?.channels.fetch(data.channel);

        if (!channel || !channel.isTextBased()) {
            await interaction.editReply({
                content: "❌ Channel not found.",
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x2b2d31);

        await channel.send({
            embeds: [embed]
        });

        await interaction.editReply({
            content: `✅ Embed sent to <#${data.channel}>`,
        });
    }
};

export default createEmbedModal;