import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { moderationHelpEmbed } from "@shared/utils/help-embed";

export default {
    data: new SlashCommandBuilder()
        .setName("mod")
        .setDescription("Moderation staff utilities")
        .addSubcommand(sub =>
            sub.setName("help").setDescription("Show all available moderation commands and usage")
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "help") {
            await interaction.reply({ embeds: [moderationHelpEmbed()], flags: MessageFlags.Ephemeral });
        }
    },
};
