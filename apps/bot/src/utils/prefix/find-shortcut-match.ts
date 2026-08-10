import type { ShortcutMatch } from "@typings/prefix";
import { ServerConfigRepository } from "@database/repositories";

/** Checks a message's content against this guild's configured /shortcut triggers. */
export async function findShortcutMatch(guildId: string, content: string): Promise<ShortcutMatch | null> {
    const shortcuts = await ServerConfigRepository.getShortcuts(guildId);
    if (!shortcuts.length) return null;

    const sorted = [...shortcuts].sort((a, b) => b.trigger.length - a.trigger.length);
    const match = sorted.find(s => content === s.trigger || content.startsWith(s.trigger + " "));
    if (!match) return null;

    return {
        command: match.command,
        trigger: match.trigger,
        args: content.slice(match.trigger.length).trim(),
        deleteMode: match.deleteMode,
    };
}
