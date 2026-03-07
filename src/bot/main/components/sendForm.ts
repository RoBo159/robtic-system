import { Events, MessageFlags, ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import { Send } from "@database/models";

export default {
    name: Events.InteractionCreate,

    async execute(interaction: ModalSubmitInteraction) {

        if (!interaction.isModalSubmit()) return;
        if (interaction.customId !== "create-embed") return;

        const title = interaction.fields.getTextInputValue("embed-title");
        const description = interaction.fields.getTextInputValue("embed-desc");

        const data = await Send.findOneAndDelete({ user: interaction.user.id });

        if (!data) {
            return interaction.reply({
                content: "⛔ Embed session expired or not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = await interaction.guild?.channels.fetch(data.channel);

        if (!channel || !channel.isTextBased()) {
            return interaction.reply({
                content: "❌ Channel not found.",
                flags: MessageFlags.Ephemeral
            });
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