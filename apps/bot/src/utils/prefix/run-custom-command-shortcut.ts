import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ShortcutMatch } from "@typings/prefix";
import { runPrefixShortcut } from "./run-prefix-shortcut";
import { resolveShortcutDeleteMode } from "./shortcut-cleanup";

/** Runs the matched shortcut. Returns false if no command owns that name — e.g. a channel-utility key, which the caller handles itself. */
export async function runCustomCommandShortcut(message: Message, client: BotClient, match: ShortcutMatch): Promise<boolean> {
    const command = client.commands.get(match.command);
    if (!command) return false;

    await runPrefixShortcut({
        message,
        client,
        command,
        commandName: match.command,
        argString: match.args,
        // The trigger stands in for the prefix, so a usage line reads `red @user <reason>` — what
        // the user actually types — rather than `!warn @user <reason>`.
        prefix: `${match.trigger} `,
        deleteMode: resolveShortcutDeleteMode(match.command, match.deleteMode),
    });
    return true;
}
