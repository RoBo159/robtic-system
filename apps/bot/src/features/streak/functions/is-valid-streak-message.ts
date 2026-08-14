import type { Message } from "discord.js";
import type { IStreak, IStreakSettings } from "@database/models";
import { STREAK_CONFIG } from "@constants";
import { isAcceptableMessage } from "@utils";

/**
 * Whether a message counts toward a streak.
 *
 * The duplicate check is windowed rather than absolute: repeating yourself a day later is a normal
 * message, repeating yourself within seconds is someone farming the counter.
 */
export function isValidStreakMessage(message: Message, settings: IStreakSettings, record: IStreak): boolean {
    if (message.author.bot || message.webhookId) return false;

    const trimmed = message.content.trim();
    if (!isAcceptableMessage(trimmed, settings.minMessageLength)) return false;

    const isDuplicate = trimmed.toLowerCase() === record.lastMessageContent.trim().toLowerCase();
    const withinDuplicateWindow = Date.now() - record.lastMessageAt.getTime() < STREAK_CONFIG.duplicateWindowMs;

    return !(isDuplicate && withinDuplicateWindow);
}
