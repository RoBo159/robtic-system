import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { modmailHelpEmbed } from "@shared/utils/help-embed";

export default {
    data: new SlashCommandBuilder()
        .setName("mod")
        .setDescription("Modmail staff utilities")
        .addSubcommand(sub =>
            sub.setName("help").setDescription("Show all available modmail commands and usage")
        ),
    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "help") {
            await interaction.reply({ embeds: [modmailHelpEmbed()], flags: MessageFlags.Ephemeral });
        }
    },
};
