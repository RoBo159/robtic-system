import {
    SlashCommandBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from "discord.js";
import { Send } from "@database/models";

export default {
    data: new SlashCommandBuilder()
        .setName("send")
        .setDescription("Send an embed message to a channel")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Select the target channel")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),

    async run(interaction: ChatInputCommandInteraction) {

        const channel = interaction.options.getChannel("channel");

        const modal = new ModalBuilder()
            .setCustomId(`create-embed`)
            .setTitle("Create Embed");

        const titleInput = new TextInputBuilder()
            .setCustomId("embed-title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(60);

        const descInput = new TextInputBuilder()
            .setCustomId("embed-desc")
            .setLabel("Embed Description")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
        );

        await Send.create({
            channel: channel?.id,
            user: interaction.user.id
        });

        setTimeout(async () => {
            const doc = await Send.findOne({ user: interaction.user.id, channel: channel?.id });
            if (doc) await Send.deleteOne({ _id: doc._id });
        }, 180000);

        await interaction.showModal(modal);
    }
};