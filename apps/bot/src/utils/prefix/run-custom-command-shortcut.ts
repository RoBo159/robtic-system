import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ShortcutMatch } from "@typings/prefix";
import { runPrefixShortcut } from "./run-prefix-shortcut";
import { resolveShortcutDeleteMode } from "./shortcut-cleanup";
import { splitCommandPath } from "./command-paths";

/**
 * Runs the matched shortcut. Returns false if no command owns that name — e.g. a channel-utility
 * key, which the caller handles itself.
 *
 * The stored target may be a full path (`warn add`), so the subcommand words are put back in front
 * of the typed arguments before parsing. That is what makes shortcuts usable at all for commands
 * built from subcommands, which is most of the moderation set.
 */
export async function runCustomCommandShortcut(message: Message, client: BotClient, match: ShortcutMatch): Promise<boolean> {
    const { name, subPath } = splitCommandPath(match.command);

    const command = client.commands.get(name);
    if (!command) return false;

    const argString = [subPath, match.args].filter(Boolean).join(" ");

    await runPrefixShortcut({
        message,
        client,
        command,
        commandName: name,
        argString,
        // The trigger stands in for the prefix, so a usage line reads `red @user <reason>` — what
        // the user actually types — rather than `!warn add @user <reason>`.
        prefix: `${match.trigger} `,
        deleteMode: resolveShortcutDeleteMode(name, match.deleteMode),
    });
    return true;
}
