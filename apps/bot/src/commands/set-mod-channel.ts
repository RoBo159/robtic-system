import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";

const MOD_CHANNEL_REGISTRY = {
    modmail: { label: "ModMail Channel", description: "Channel where modmail threads are created" },
} as const;

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("set-mod-channel")
        .setDescription("Configure a moderation channel for this server"),

    requiredPermission: 100,
    department: "Management" as Department,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const options = Object.entries(MOD_CHANNEL_REGISTRY).map(([key, meta]) =>
            new StringSelectMenuOptionBuilder()
                .setValue(key)
                .setLabel(meta.label)
                .setDescription(meta.description)
        );

        const select = new StringSelectMenuBuilder()
            .setCustomId("set_mod_channel_select")
            .setPlaceholder("Select a channel type to configure...")
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.reply({
            content: "Select a moderation channel type to configure:",
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
    },
};
