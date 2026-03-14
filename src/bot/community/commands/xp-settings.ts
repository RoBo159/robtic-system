import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    ChannelType,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { XPSettingsRepository } from "@database/repositories";
import { Colors } from "@core/config";

export default {
    data: new SlashCommandBuilder()
        .setName("xp-settings")
        .setDescription("Configure XP system settings")

        .addSubcommand(sub =>
            sub
                .setName("add-channel")
                .setDescription("Add an XP-earning channel")
                .addChannelOption(opt =>
                    opt.setName("channel").setDescription("Channel to add").addChannelTypes(ChannelType.GuildText).setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("type").setDescription("Channel type").addChoices(
                        { name: "Chat (member XP)", value: "chat" },
                        { name: "Support", value: "support" },
                        { name: "Staff", value: "staff" },
                    ).setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("remove-channel")
                .setDescription("Remove an XP channel")
                .addStringOption(opt =>
                    opt.setName("type").setDescription("Channel type").addChoices(
                        { name: "Chat (member XP)", value: "chat" },
                        { name: "Support", value: "support" },
                        { name: "Staff", value: "staff" },
                    ).setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("channel").setDescription("Channel to remove").setRequired(true).setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("decay")
                .setDescription("Toggle XP decay system")
                .addBooleanOption(opt =>
                    opt.setName("enabled").setDescription("Enable or disable decay").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("view")
                .setDescription("View current XP settings")
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand();

        if (sub === "add-channel") {
            const channel = interaction.options.getChannel("channel", true);
            const type = interaction.options.getString("type", true);

            if (type === "chat") await XPSettingsRepository.addChatChannel(guildId, channel.id);
            else if (type === "support") await XPSettingsRepository.addSupportChannel(guildId, channel.id);
            else await XPSettingsRepository.addStaffChannel(guildId, channel.id);

            await interaction.reply({
                content: `Added <#${channel.id}> as a **${type}** channel.`,
                ephemeral: true,
            });
        }

        else if (sub === "remove-channel") {
            const channelId = interaction.options.getString("channel", true);
            const type = interaction.options.getString("type", true);

            if (type === "chat") await XPSettingsRepository.removeChatChannel(guildId, channelId);
            else if (type === "support") await XPSettingsRepository.removeSupportChannel(guildId, channelId);
            else await XPSettingsRepository.removeStaffChannel(guildId, channelId);

            await interaction.reply({
                content: `Removed <#${channelId}> from **${type}** channels.`,
                ephemeral: true,
            });
        }

        else if (sub === "decay") {
            const enabled = interaction.options.getBoolean("enabled", true);
            await XPSettingsRepository.setDecayEnabled(guildId, enabled);

            await interaction.reply({
                content: `XP decay is now **${enabled ? "enabled" : "disabled"}**.`,
                ephemeral: true,
            });
        }

        else if (sub === "view") {
            const settings = await XPSettingsRepository.getOrCreate(guildId);
            const chatChs = settings.chatChannels.map(id => `<#${id}>`).join(", ") || "None";
            const supportChs = settings.supportChannels.map(id => `<#${id}>`).join(", ") || "None";
            const staffChs = settings.staffChannels.map(id => `<#${id}>`).join(", ") || "None";

            const embed = new EmbedBuilder()
                .setTitle("XP Settings")
                .addFields(
                    { name: "Chat Channels", value: chatChs },
                    { name: "Support Channels", value: supportChs },
                    { name: "Staff Channels", value: staffChs },
                    { name: "Decay Enabled", value: settings.decayEnabled ? "Yes" : "No", inline: true },
                )
                .setColor(Colors.info)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "channel") return interaction.respond([]);

        const guildId = interaction.guildId!;
        const type = interaction.options.getString("type");
        const settings = await XPSettingsRepository.get(guildId);
        if (!settings) return interaction.respond([]);

        let channelIds: string[] = [];
        if (type === "chat") channelIds = settings.chatChannels;
        else if (type === "support") channelIds = settings.supportChannels;
        else if (type === "staff") channelIds = settings.staffChannels;

        const guild = interaction.guild;
        const choices = channelIds
            .map(id => {
                const ch = guild?.channels.cache.get(id);
                return { name: ch ? `#${ch.name}` : `#unknown (${id})`, value: id };
            })
            .filter(c =>
                c.name.toLowerCase().includes(focused.value.toLowerCase())
            )
            .slice(0, 25);

        await interaction.respond(choices);
    },
};
