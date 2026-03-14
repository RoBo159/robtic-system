import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
} from "discord.js";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import { ChatUtils } from "../utils/chat";
import { Colors } from "@core/config";

const allowedCommands = Object.keys(ChatUtils);

export default {
    data: new SlashCommandBuilder()
        .setName("shortcut")
        .setDescription("Manage message shortcuts for moderation commands")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Add a new shortcut")
                .addStringOption(opt =>
                    opt.setName("command")
                        .setDescription("The moderation command to execute")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("msg")
                        .setDescription("The message that triggers this command")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Remove a shortcut")
                .addStringOption(opt =>
                    opt.setName("msg")
                        .setDescription("The trigger message to remove")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("List current shortcuts")
        ),

    async autocomplete(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "command") {
            const items = allowedCommands.filter(c => c.toLowerCase().startsWith(focused.value.toLowerCase()));
            await interaction.respond(items.map(c => ({ name: c, value: c })));
        } else if (focused.name === "msg") {
            if (!interaction.guildId) return;
            const shortcuts = await ServerConfigRepository.getShortcuts(interaction.guildId);
            const items = shortcuts.filter(s => s.trigger.toLowerCase().startsWith(focused.value.toLowerCase()));
            await interaction.respond(items.map(s => ({ name: s.trigger, value: s.trigger })));
        }
    },

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return;
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === "add") {
            const command = interaction.options.getString("command", true);
            const trigger = interaction.options.getString("msg", true);

            if (!allowedCommands.includes(command)) {
                return interaction.reply({ content: `Invalid command. Allowed: ${allowedCommands.join(", ")}`, ephemeral: true });
            }

            await ServerConfigRepository.addShortcut(guildId, command, trigger);

            return interaction.reply({
                content: `Shortcut added! Typing "${trigger}" will now execute "/chat ${command}".`,
                ephemeral: true
            });
        } else if (subcommand === "remove") {
            const trigger = interaction.options.getString("msg", true);
            const result = await ServerConfigRepository.removeShortcut(guildId, trigger);

            if (!result) return interaction.reply({ content: "Error accessing database.", ephemeral: true });

            return interaction.reply({ content: `Shortcut "${trigger}" removed (if it existed).`, ephemeral: true });
        } else if (subcommand === "list") {
            const shortcuts = await ServerConfigRepository.getShortcuts(guildId);
            if (shortcuts.length === 0) {
                return interaction.reply({ content: "No shortcuts defined.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle("Moderation Shortcuts")
                .setDescription(shortcuts.map(s => `• \`${s.trigger}\` → \`/chat ${s.command}\``).join("\n"))
                .setColor(Colors.info || 0x3498DB);

            return interaction.reply({ embeds: [embed] });
        }
    }
};
