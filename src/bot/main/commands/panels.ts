import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { panelList, panelSend, panelDelete, panelAutocompleteChoices, sentPanelAutocomplete } from "../utils/panels";

export default {
    data: new SlashCommandBuilder()
        .setName("panels")
        .setDescription("Manage server panels")
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("List all available panels")
        )
        .addSubcommand(sub =>
            sub.setName("send")
                .setDescription("Send a panel to the current channel")
                .addStringOption(opt =>
                    opt.setName("panel")
                        .setDescription("The panel to send")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("delete")
                .setDescription("Delete a sent panel")
                .addStringOption(opt =>
                    opt.setName("panel_message")
                        .setDescription("The panel to delete")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "list":
                await panelList(interaction);
                break;
            case "send":
                await panelSend(interaction);
                break;
            case "delete":
                await panelDelete(interaction);
                break;
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused();

        if (sub === "send") {
            const choices = panelAutocompleteChoices(focused);
            await interaction.respond(choices);
        } else if (sub === "delete") {
            const choices = await sentPanelAutocomplete(interaction.guildId!, focused);
            await interaction.respond(choices);
        }
    },
};