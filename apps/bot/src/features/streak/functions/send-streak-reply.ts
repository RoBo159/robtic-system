import type { Message, TextChannel } from "discord.js";
import type { IStreak, IStreakSettings } from "@database/models";
import { STREAK_CONFIG, STREAK_MESSAGES } from "@constants";
import { Logger } from "@logger";

const CTX = "main:streak";

/**
 * Announces a streak increment.
 *
 * With an announce channel configured the message goes there and stays, because the point of a
 * dedicated channel is a visible run of everyone's milestones. Without one it falls back to
 * replying where the streak was earned and deleting itself shortly after, which is the older
 * behaviour and keeps chat channels clear.
 */
export async function sendStreakReply(message: Message, streak: IStreak, settings: IStreakSettings): Promise<void> {
    const text = STREAK_MESSAGES.reached(message.author.id, streak.currentStreak, streak.bestStreak);

    if (settings.announceChannelId) {
        const channel = message.guild?.channels.cache.get(settings.announceChannelId)
            ?? await message.guild?.channels.fetch(settings.announceChannelId).catch(() => null);

        if (channel?.isTextBased()) {
            await (channel as TextChannel).send({ content: text, allowedMentions: { users: [message.author.id] } }).catch(err => {
                Logger.warn(`Could not post streak announcement in ${settings.announceChannelId}: ${err}`, CTX);
            });
            return;
        }

        Logger.warn(`Streak announce channel ${settings.announceChannelId} is missing or not text — falling back to an in-channel reply`, CTX);
    }

    if (!message.channel.isSendable()) return;

    const reply = await message.reply({ content: text, allowedMentions: { repliedUser: false } }).catch(() => null);
    if (!reply) return;

    setTimeout(() => {
        reply.delete().catch(() => null);
    }, STREAK_CONFIG.autoDeleteMs);
}
