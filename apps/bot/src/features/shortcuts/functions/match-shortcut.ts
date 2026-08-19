import type { GuildMember, Message } from "discord.js";
import type { IShortcutDoc } from "@database/models";
import { ShortcutRepository } from "@database/repositories";

export interface ShortcutHit {
    shortcut: IShortcutDoc;
    /** What the member typed after the trigger. */
    args: string;
    /**
     * True when the trigger was written with the guild prefix (`?c`), which is a deliberate command
     * and deserves an error when it doesn't parse. A bare trigger is indistinguishable from ordinary
     * chat, so callers keep quiet about that one instead.
     */
    viaPrefix: boolean;
}

/**
 * Finds the shortcut a message invokes, if any.
 *
 * Longest trigger first, so `red flag` wins over `red` when both exist — otherwise the shorter one
 * would always claim the message and the longer could never fire. A trigger matches the whole
 * message or the message up to a space, never mid-word: `redirect` must not trigger `red`.
 *
 * The trigger is matched bare (`c`) and, via `prefixStripped`, with the guild prefix in front
 * (`?c`). People who learned the bot through `?coins balance` type the prefix out of habit, and a
 * shortcut that answers one form but silently ignores the other reads as broken.
 *
 * Restrictions are applied here rather than after running, so a member who cannot use a trigger
 * gets silence rather than a permission error for a command they never named.
 */
export async function matchShortcut(
    message: Message,
    member: GuildMember,
    /**
     * Content with the guild prefix already stripped, when the caller determined the message was
     * prefixed and named no real command. Null when the message was not prefixed.
     */
    prefixStripped: string | null = null,
): Promise<ShortcutHit | null> {
    const shortcuts = await ShortcutRepository.listCached(message.guild!.id);
    if (!shortcuts.length) return null;

    const content = (prefixStripped ?? message.content).trim();
    const lowered = content.toLowerCase();

    const candidates = [...shortcuts].sort((a, b) => b.trigger.length - a.trigger.length);

    for (const shortcut of candidates) {
        const trigger = shortcut.trigger;
        const isExact = lowered === trigger;
        const isPrefixed = lowered.startsWith(trigger + " ");
        if (!isExact && !isPrefixed) continue;

        if (!shortcut.enabled) return null;
        if (shortcut.channelIds.length && !shortcut.channelIds.includes(message.channel.id)) return null;
        if (shortcut.allowedRoleIds.length && !shortcut.allowedRoleIds.some(id => member.roles.cache.has(id))) return null;

        return { shortcut, args: content.slice(trigger.length).trim(), viaPrefix: prefixStripped !== null };
    }

    return null;
}
