import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { moderationHelpEmbed } from "@bot/utils/help";

export default {
    scope: "guild",
    access: "general",
    category: "Utility",
    data: new SlashCommandBuilder()
        .setName("mod")
        .setDescription("Moderation staff utilities")
        .addSubcommand(sub =>
            sub.setName("help")
                .setDescription("Show all available moderation commands and usage")
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (interaction.options.getSubcommand() !== "help") return;

        await interaction.reply({ embeds: [moderationHelpEmbed()], flags: MessageFlags.Ephemeral });
    },
};
