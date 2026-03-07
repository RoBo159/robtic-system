import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import { Send } from "@database/models";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";

const createEmbedModal: ComponentHandler<ModalSubmitInteraction> = {
    customId: "create-embed",

    async run(interaction: ModalSubmitInteraction, client: BotClient) {

        if (!interaction.isModalSubmit()) return;

        const title = interaction.fields.getTextInputValue("embed-title");
        const description = interaction.fields.getTextInputValue("embed-desc");

        const data = await Send.findOneAndDelete({
            user: interaction.user.id
        });

        if (!data) {
            await interaction.reply({
                content: "⛔ Embed session expired or not found.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const channel = await interaction.guild?.channels.fetch(data.channel);

        if (!channel || !channel.isTextBased()) {
            await interaction.reply({
                content: "❌ Channel not found.",
                flags: MessageFlags.Ephemeral
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

        await interaction.reply({
            content: `✅ Embed sent to <#${data.channel}>`,
            flags: MessageFlags.Ephemeral
        });
    }
};

export default createEmbedModal;