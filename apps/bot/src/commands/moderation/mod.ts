import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { moderationHelpEmbed, modmailHelpEmbed } from "../../utils/help";

/**
 * Moderation and modmail each used to register their own `/mod help` on their own bot. On one
 * client only one of the two could exist, so the section they each documented is now a choice.
 */
export default {
    category: "Utility",
    data: new SlashCommandBuilder()
        .setName("mod")
        .setDescription("Moderation staff utilities")
        .addSubcommand(sub =>
            sub.setName("help")
                .setDescription("Show all available moderation or modmail commands and usage")
                .addStringOption(opt =>
                    opt.setName("section")
                        .setDescription("Which command set to show (defaults to moderation)")
                        .addChoices(
                            { name: "moderation", value: "moderation" },
                            { name: "modmail", value: "modmail" },
                        )
                )
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (interaction.options.getSubcommand() !== "help") return;

        const section = interaction.options.getString("section") ?? "moderation";
        const embed = section === "modmail" ? modmailHelpEmbed() : moderationHelpEmbed();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
