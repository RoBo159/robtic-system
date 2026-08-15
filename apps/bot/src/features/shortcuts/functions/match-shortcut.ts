import type { GuildMember, Message } from "discord.js";
import type { IShortcutDoc } from "@database/models";
import { ShortcutRepository } from "@database/repositories";

export interface ShortcutHit {
    shortcut: IShortcutDoc;
    /** What the member typed after the trigger. */
    args: string;
}

/**
 * Finds the shortcut a message invokes, if any.
 *
 * Longest trigger first, so `red flag` wins over `red` when both exist — otherwise the shorter one
 * would always claim the message and the longer could never fire. A trigger matches the whole
 * message or the message up to a space, never mid-word: `redirect` must not trigger `red`.
 *
 * Restrictions are applied here rather than after running, so a member who cannot use a trigger
 * gets silence rather than a permission error for a command they never named.
 */
export async function matchShortcut(message: Message, member: GuildMember): Promise<ShortcutHit | null> {
    const shortcuts = await ShortcutRepository.listCached(message.guild!.id);
    if (!shortcuts.length) return null;

    const content = message.content.trim();
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

        return { shortcut, args: content.slice(trigger.length).trim() };
    }

    return null;
}
