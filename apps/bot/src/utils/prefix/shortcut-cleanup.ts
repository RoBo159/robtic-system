import type { Message } from "discord.js";
import { SHORTCUT_REPLY_LIFETIME_MS, type ShortcutDeleteMode } from "@constants";
import { ChatUtils } from "@bot/utils/moderation/chat";

const CHAT_UTIL_COMMANDS = new Set(Object.keys(ChatUtils));

/**
 * The delete mode a shortcut runs with when its stored `deleteMode` is unset.
 *
 * Channel-utility shortcuts (`!lock`, `!clear`) exist to change the channel, not to leave a
 * transcript, so both messages go. Everything else is a real command whose invocation is worth
 * keeping — a ban with no trace of who asked for it is a worse channel than a noisy one.
 */
export function resolveShortcutDeleteMode(command: string, stored?: ShortcutDeleteMode): ShortcutDeleteMode {
    if (stored) return stored;
    return CHAT_UTIL_COMMANDS.has(command) ? "both" : "none";
}

/** Removes the shortcut's reply, and its trigger message too under `both`, after a short grace period. */
export function scheduleShortcutCleanup(
    trigger: Message,
    reply: Message | null,
    mode: ShortcutDeleteMode,
): void {
    if (mode === "none") return;

    setTimeout(() => {
        reply?.delete().catch(() => null);
        if (mode === "both") trigger.delete().catch(() => null);
    }, SHORTCUT_REPLY_LIFETIME_MS);
}
