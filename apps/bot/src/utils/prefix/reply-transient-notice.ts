import type { Message } from "discord.js";
import { PREFIX_USAGE_DELETE_MS } from "@constants";

/**
 * Sends a short-lived usage/validation notice, then deletes both the bot's reply and the user's
 * triggering message after PREFIX_USAGE_DELETE_MS so a mistyped command doesn't linger in chat.
 */
export async function replyTransientNotice(message: Message, content: string): Promise<void> {
    const notice = await message.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => null);
    setTimeout(() => {
        notice?.delete().catch(() => null);
        message.delete().catch(() => null);
    }, PREFIX_USAGE_DELETE_MS);
}
