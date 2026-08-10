import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ChannelType } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { ServerConfigRepository } from "@database/repositories";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("set-commands-channel")
        .setDescription("Set the channel where only bot commands are allowed")
        .addChannelOption(opt =>
            opt.setName("channel").setDescription("The commands-only channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),

    requiredPermission: 100,
    department: "Management" as Department,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel("channel", true);
        await ServerConfigRepository.setCommandsChannel(interaction.guildId!, channel.id);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("✅ Commands Channel Set")
                .setColor(COLORS.success)
                .setDescription(`Non-command messages in <#${channel.id}> will now be removed automatically. Any message starting with a symbol (this bot's or another bot's prefix) is left alone.`)],
        });
    },
};
