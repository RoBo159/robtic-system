import type { Message } from "discord.js";
import type { IStreak } from "@database/models";
import { STREAK_CONFIG } from "@constants";

/** Confirms the increment in-channel, then cleans up so streak channels stay readable. */
export async function sendStreakReply(message: Message, streak: IStreak): Promise<void> {
    if (!message.channel.isSendable()) return;

    const reply = await message
        .reply(`🔥 التتابع ${streak.currentStreak}!\n\nعُد غداً لمواصلة تتابعك.`)
        .catch(() => null);
    if (!reply) return;

    setTimeout(() => {
        reply.delete().catch(() => null);
    }, STREAK_CONFIG.autoDeleteMs);
}
