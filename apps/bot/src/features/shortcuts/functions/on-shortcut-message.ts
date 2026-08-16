import type { GuildMember, Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { ShortcutRepository, ServerConfigRepository } from "@database/repositories";
import { DEFAULT_PREFIX } from "@constants";
import { isFeatureEnabled } from "@core/features";
import { runPrefixShortcut, splitCommandPath, resolveShortcutDeleteMode } from "@bot/utils/prefix";
import { matchShortcut } from "./match-shortcut";
import { applyArgsTemplate } from "./apply-args-template";
import { CHAT_UTIL_COMMANDS, runChatUtilShortcut } from "./run-chat-util";

/**
 * The message with the guild prefix removed, when a shortcut is allowed to claim that form.
 *
 * Returns null unless the message is prefixed **and** its first word is not a real command, which
 * is the whole safety condition: `?coins balance` must stay the coins command and must not also
 * fire a `coins` trigger, or a member would see the balance twice. `?c`, naming nothing, is free
 * for a shortcut to answer — and the prefix router has already declined it by then.
 */
async function strippedPrefixForm(message: Message, client: BotClient): Promise<string | null> {
    const prefix = (await ServerConfigRepository.getPrefix(message.guild!.id)) ?? DEFAULT_PREFIX;
    if (!message.content.startsWith(prefix)) return null;

    const rest = message.content.slice(prefix.length).trim();
    if (!rest) return null;

    const firstWord = rest.split(/\s+/)[0]!.toLowerCase();
    if (client.commands.has(firstWord) || client.messageCommands.has(firstWord)) return null;

    return rest;
}

export async function onShortcutMessage(message: Message, client: BotClient): Promise<void> {
    if (message.author.bot || !message.guild || !message.member) return;
    if (!(await isFeatureEnabled(message.guild.id, "shortcuts"))) return;

    const member = message.member as GuildMember;
    const hit = await matchShortcut(message, member, await strippedPrefixForm(message, client));
    if (!hit) return;

    const { shortcut } = hit;
    const args = applyArgsTemplate(shortcut.argsTemplate, hit.args);
    const deleteMode = resolveShortcutDeleteMode(shortcut.command, shortcut.deleteMode);

    if (CHAT_UTIL_COMMANDS.has(shortcut.command)) {
        const ran = await runChatUtilShortcut(message, member, shortcut.command, args, deleteMode);
        if (ran) await ShortcutRepository.recordUse(message.guild.id, shortcut.trigger);
        return;
    }

    const { name, subPath } = splitCommandPath(shortcut.command);
    const command = client.commands.get(name);
    if (!command) return;

    await runPrefixShortcut({
        message,
        client,
        command,
        commandName: name,
        // The subcommand words go back in front of the arguments, which is what makes a shortcut
        // usable for a command built from subcommands.
        argString: [subPath, args].filter(Boolean).join(" "),
        // The trigger stands in for the prefix, so a usage line reads `red @user <reason>` — what
        // the member actually types — rather than `!warn add @user <reason>`.
        prefix: `${shortcut.trigger} `,
        deleteMode,
    });

    await ShortcutRepository.recordUse(message.guild.id, shortcut.trigger);
}
