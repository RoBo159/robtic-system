import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ShortcutMatch } from "@typings/prefix";
import { runPrefixShortcut } from "./run-prefix-shortcut";

/** Runs the matched shortcut if this bot owns that command. Returns false (not true) if it doesn't — e.g. a ChatUtils-only key, or a command owned by a different bot. */
export async function runCustomCommandShortcut(message: Message, client: BotClient, match: ShortcutMatch): Promise<boolean> {
    const command = client.commands.get(match.command);
    if (!command) return false;

    await runPrefixShortcut(message, client, command, match.command, match.args, `${match.trigger} `);
    return true;
}
