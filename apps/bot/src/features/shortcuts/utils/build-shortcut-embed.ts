import { EmbedBuilder } from "discord.js";
import type { IShortcutDoc } from "@database/models";
import { COLORS, SHORTCUT_DELETE_MODE_SHORT, type ShortcutDeleteMode } from "@constants";
import { CHAT_UTIL_COMMANDS } from "../functions/run-chat-util";

export const targetLabel = (command: string): string =>
    CHAT_UTIL_COMMANDS.has(command) ? `/chat ${command}` : `/${command}`;

/** One line per shortcut for `/shortcut list`. */
export function buildShortcutListEmbed(shortcuts: IShortcutDoc[]): EmbedBuilder {
    const lines = shortcuts.map(s => {
        const mode = SHORTCUT_DELETE_MODE_SHORT[s.deleteMode as ShortcutDeleteMode];
        const restricted = s.allowedRoleIds.length || s.channelIds.length ? " 🔒" : "";
        const off = s.enabled ? "" : " ⏸️";
        return `• \`${s.trigger}\` → \`${targetLabel(s.command)}\`${s.argsTemplate ? ` \`${s.argsTemplate}\`` : ""} · ${mode}${restricted}${off}`;
    });

    return new EmbedBuilder()
        .setTitle("Shortcuts")
        .setColor(COLORS.info)
        .setDescription(lines.join("\n") || "No shortcuts defined.")
        .setFooter({ text: "🔒 restricted · ⏸️ disabled · use /shortcut info <trigger> for detail" });
}

/** Everything about one shortcut, including its restrictions and usage. */
export function buildShortcutInfoEmbed(shortcut: IShortcutDoc): EmbedBuilder {
    const list = (ids: string[], mention: (id: string) => string, empty: string) =>
        ids.length ? ids.map(mention).join(", ") : empty;

    return new EmbedBuilder()
        .setTitle(`Shortcut — ${shortcut.trigger}`)
        .setColor(shortcut.enabled ? COLORS.info : COLORS.warning)
        .addFields(
            { name: "Runs", value: `\`${targetLabel(shortcut.command)}\``, inline: true },
            { name: "Status", value: shortcut.enabled ? "Enabled" : "Disabled", inline: true },
            { name: "Cleanup", value: SHORTCUT_DELETE_MODE_SHORT[shortcut.deleteMode as ShortcutDeleteMode], inline: true },
            {
                name: "Fixed arguments",
                value: shortcut.argsTemplate ? `\`${shortcut.argsTemplate}\`` : "None — the member's input is passed through as-is",
            },
            { name: "Allowed roles", value: list(shortcut.allowedRoleIds, id => `<@&${id}>`, "Anyone who can run the command") },
            { name: "Channels", value: list(shortcut.channelIds, id => `<#${id}>`, "Every channel") },
            {
                name: "Used",
                value: shortcut.uses > 0
                    ? `${shortcut.uses} time(s), last <t:${Math.floor((shortcut.lastUsedAt ?? shortcut.createdAt).getTime() / 1000)}:R>`
                    : "Never",
            },
        );
}
