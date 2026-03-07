import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import messages from "../utils/messages.json";

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
            const embed = new EmbedBuilder()
                .setTitle(messages.embed.mod_help_title)
                .setColor(Colors.info)
                .addFields(
                    {
                        name: "Thread Management",
                        value: [
                            "`/thread close` — Close the current modmail thread",
                            "`/thread stop` — Pause the conversation (claimer only)",
                            "`/thread start` — Resume a paused conversation (claimer only)",
                            "`/thread reopen` — Reopen a closed thread (managers only)",
                            "`/thread status` — Display all active and closed threads",
                        ].join("\n"),
                    },
                    {
                        name: "Communication",
                        value: [
                            "`!reply <message>` — Send a message to the user",
                            "`/transfer @staff` — Transfer the thread to another staff member",
                        ].join("\n"),
                    },
                    {
                        name: "Tags",
                        value: [
                            "`!tag` — List all available tags",
                            "`!tag <key>` — Send a tag message to the user",
                            "`/tag create` — Create a new tag",
                            "`/tag delete` — Delete an existing tag",
                            "`/tag help` — Show tag usage and template variables",
                        ].join("\n"),
                    },
                    {
                        name: "Notes",
                        value: [
                            "`!note` — View notes for the thread user",
                            "📝 **Notes** button — View notes from the info embed",
                        ].join("\n"),
                    },
                    {
                        name: "Info",
                        value: [
                            "✋ **Claim** button — Claim the thread to handle it",
                            "🔒 **Close** button — Close the thread from the info embed",
                        ].join("\n"),
                    },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
