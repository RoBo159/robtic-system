import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import {
    COLORS,
    SHORTCUT_DELETE_MODES,
    SHORTCUT_DELETE_MODE_LABELS,
    SHORTCUT_DELETE_MODE_SHORT,
    isShortcutDeleteMode,
    type ShortcutDeleteMode,
} from "@constants";
import { ChatUtils } from "@bot/utils/moderation/chat";
import { resolveShortcutDeleteMode } from "@bot/utils/prefix";

/** Channel-utility actions have no slash command behind them — events/custom-shortcut.ts runs them directly. */
const CHAT_UTIL_COMMANDS = Object.keys(ChatUtils);

function getAllCommandNames(client: BotClient): string[] {
    return [...new Set([...CHAT_UTIL_COMMANDS, ...client.commands.keys()])];
}

function commandExists(client: BotClient, command: string): boolean {
    return CHAT_UTIL_COMMANDS.includes(command) || client.commands.has(command);
}

export default {
    scope: "guild",
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("shortcut")
        .setDescription("Manage custom message-trigger shortcuts for any command")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Add or update a shortcut")
                .addStringOption(opt =>
                    opt.setName("command")
                        .setDescription("The command to execute")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("delete")
                        .setDescription("What to clean up after it runs")
                        .setRequired(true)
                        .addChoices(
                            ...SHORTCUT_DELETE_MODES.map(mode => ({ name: SHORTCUT_DELETE_MODE_LABELS[mode], value: mode })),
                        )
                )
                // Last, and the only free-text option, so a multi-word trigger survives
                // `!shortcut add warn both red flag` — the parser gives the final string the rest
                // of the line.
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

    async autocomplete(interaction: AutocompleteInteraction, client: BotClient) {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "command") {
            const items = getAllCommandNames(client)
                .filter(c => c.toLowerCase().startsWith(focused.value.toLowerCase()))
                .sort()
                .slice(0, 25);
            await interaction.respond(items.map(c => ({ name: CHAT_UTIL_COMMANDS.includes(c) ? `${c} (chat)` : c, value: c })));
        } else if (focused.name === "msg") {
            if (!interaction.guildId) return;
            const shortcuts = await ServerConfigRepository.getShortcuts(interaction.guildId);
            const items = shortcuts.filter(s => s.trigger.toLowerCase().startsWith(focused.value.toLowerCase()));
            await interaction.respond(items.map(s => ({ name: s.trigger, value: s.trigger })));
        }
    },

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === "add") {
            const command = interaction.options.getString("command", true);
            const trigger = interaction.options.getString("msg", true);
            const deleteMode = interaction.options.getString("delete", true);

            if (!commandExists(client, command)) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ content: `Unknown command \`${command}\` — pick a suggestion from autocomplete.`, flags: MessageFlags.Ephemeral });
                return;
            }

            // Slash usage can only send a valid choice, but the prefix parser takes whatever word
            // is in that position and does not check it against the choice list.
            if (!isShortcutDeleteMode(deleteMode)) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({
                    content: `Unknown delete mode \`${deleteMode}\` — use one of: ${SHORTCUT_DELETE_MODES.map(m => `\`${m}\``).join(", ")}.`,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await ServerConfigRepository.addShortcut(guildId, command, trigger, deleteMode);

            const isChatUtil = CHAT_UTIL_COMMANDS.includes(command);
            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({
                content:
                    `Shortcut added! Typing "${trigger}" will now execute "${isChatUtil ? `/chat ${command}` : `/${command}`}".\n` +
                    `After it runs: ${SHORTCUT_DELETE_MODE_LABELS[deleteMode].toLowerCase()}.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        } else if (subcommand === "remove") {
            const trigger = interaction.options.getString("msg", true);
            const result = await ServerConfigRepository.removeShortcut(guildId, trigger);

            if (!result) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ content: "Error accessing database.", flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({ content: `Shortcut "${trigger}" removed (if it existed).`, flags: MessageFlags.Ephemeral });
            return;
        } else if (subcommand === "list") {
            const shortcuts = await ServerConfigRepository.getShortcuts(guildId);
            if (shortcuts.length === 0) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ content: "No shortcuts defined.", flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = shortcuts.map(s => {
                const target = CHAT_UTIL_COMMANDS.includes(s.command) ? `/chat ${s.command}` : `/${s.command}`;
                const mode = resolveShortcutDeleteMode(s.command, s.deleteMode as ShortcutDeleteMode | undefined);
                return `• \`${s.trigger}\` → \`${target}\` · deletes ${SHORTCUT_DELETE_MODE_SHORT[mode]}`;
            });

            const embed = new EmbedBuilder()
                .setTitle("Shortcuts")
                .setDescription(lines.join("\n"))
                .setColor(COLORS.info || 0x3498DB);

            await interaction.editReply({ embeds: [embed] });
        }
    }
};
