import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    ChannelType,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { ServerConfigRepository } from "@database/repositories";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("line")
        .setDescription("Manage the channels that auto-attach the line image and react to every message")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Add a line channel")
                .addChannelOption(opt =>
                    opt.setName("channel")
                        .setDescription("The channel to add as a line channel")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Remove a line channel")
                .addStringOption(opt =>
                    opt.setName("channel")
                        .setDescription("The line channel to remove")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    requiredPermission: 100,
    department: "Management" as Department,

    async autocomplete(interaction: AutocompleteInteraction) {
        if (!interaction.guildId) {
            await interaction.respond([]);
            return;
        }

        const focused = interaction.options.getFocused().toLowerCase();
        const channelIds = await ServerConfigRepository.getLineChannels(interaction.guildId);

        const choices = channelIds
            .map(id => {
                const channel = interaction.guild?.channels.cache.get(id);
                return { name: channel ? `#${channel.name}` : id, value: id };
            })
            .filter(c => c.name.toLowerCase().includes(focused) || c.value.includes(focused));

        await interaction.respond(choices.slice(0, 25));
    },

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!interaction.guildId) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription("❌ This command can only be used in a server.")
                    .setColor(COLORS.error)],
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "add") {
            const channel = interaction.options.getChannel("channel", true);
            await ServerConfigRepository.addLineChannel(interaction.guildId, channel.id);

            const embed = new EmbedBuilder()
                .setTitle("✅ Line Channel Added")
                .setColor(COLORS.success)
                .setDescription(`Every message sent in <#${channel.id}> will now automatically get the line image attached and reacted to.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // remove
        const channelId = interaction.options.getString("channel", true);
        await ServerConfigRepository.removeLineChannel(interaction.guildId, channelId);

        const embed = new EmbedBuilder()
            .setTitle("✅ Line Channel Removed")
            .setColor(COLORS.success)
            .setDescription(`<#${channelId}> will no longer get the line image attached or reacted to.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
