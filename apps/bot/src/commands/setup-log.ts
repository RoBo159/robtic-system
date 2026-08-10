import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { LOG_REGISTRY, LOG_SETUP_MESSAGES } from "@constants";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("setup-log")
        .setDescription("Configure a global log channel"),

    requiredPermission: 100,
    department: "Management" as Department,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const options = Object.entries(LOG_REGISTRY).map(([key, meta]) =>
            new StringSelectMenuOptionBuilder()
                .setValue(key)
                .setLabel(meta.label)
                .setDescription(meta.description)
        );

        const select = new StringSelectMenuBuilder()
            .setCustomId("setup_log_select")
            .setPlaceholder(LOG_SETUP_MESSAGES.selectPlaceholder)
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.reply({
            content: LOG_SETUP_MESSAGES.selectPrompt,
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
    },
};
