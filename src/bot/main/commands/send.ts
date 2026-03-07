import {
    SlashCommandBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from "discord.js";

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
        )

        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Embed style")
                .addChoices(
                    { name: "With Line", value: "line" },
                    { name: "Default Embed", value: "none" }
                )
        ),

    async run(interaction: ChatInputCommandInteraction) {

        const channel = interaction.options.getChannel("channel");
        const type = interaction.options.getString("type") ?? "none";

        const modal = new ModalBuilder()
            .setCustomId(`create-embed:${channel?.id}:${type}`)
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

        await interaction.showModal(modal);
    }
};