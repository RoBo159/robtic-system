import { DEFAULT_PREFIX } from "@constants";
import { ServerConfigRepository, ShortcutRepository } from "@database/repositories";

/**
 * Turns whatever an admin typed into the trigger as it is actually stored.
 *
 * Triggers are stored lowercased and without a prefix, but they are *used* both ways — `c` and
 * `?c` both fire one. So `/shortcut remove ?c` is the obvious thing to type and, before this,
 * answered "no shortcut called ?c" while the shortcut sat there working.
 *
 * Only strips the prefix when what remains is a real trigger, so a server whose prefix is `!` can
 * still manage a trigger that genuinely begins with `!`.
 */
export async function resolveTrigger(guildId: string, raw: string): Promise<string> {
    const typed = raw.trim().toLowerCase();
    if (!typed) return typed;

    const shortcuts = await ShortcutRepository.listCached(guildId);
    if (shortcuts.some(shortcut => shortcut.trigger === typed)) return typed;

    const prefix = (await ServerConfigRepository.getPrefix(guildId)) ?? DEFAULT_PREFIX;
    if (!prefix || !typed.startsWith(prefix)) return typed;

    const stripped = typed.slice(prefix.length).trim();
    return shortcuts.some(shortcut => shortcut.trigger === stripped) ? stripped : typed;
}

/** The triggers a server has, for a "no such trigger" reply that actually helps. */
export async function knownTriggers(guildId: string, limit = 15): Promise<string> {
    const shortcuts = await ShortcutRepository.listCached(guildId);
    if (shortcuts.length === 0) return "This server has no shortcuts yet.";

    const names = shortcuts.slice(0, limit).map(shortcut => `\`${shortcut.trigger}\``).join(" · ");
    return shortcuts.length > limit
        ? `Existing: ${names} …and ${shortcuts.length - limit} more.`
        : `Existing: ${names}`;
}
