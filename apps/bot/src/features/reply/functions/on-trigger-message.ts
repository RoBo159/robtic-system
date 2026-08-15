import type { Message } from "discord.js";
import { ReplyRepository } from "@database/repositories";
import { Logger } from "@logger";
import { isFeatureEnabled } from "@core/features";

const CTX = "reply";

/**
 * Answers a message whose whole content matches a configured trigger.
 *
 * This listener is the piece that was missing: `/reply add` has always written triggers, and
 * `getRandomReply` has always existed, but nothing ever called it — so every reply a server
 * configured sat in the database and never fired.
 *
 * Matching is on the full trimmed message, case-insensitively, rather than a substring search. A
 * substring match would fire mid-sentence and turn any mention of the trigger word into a bot
 * interruption; it would also mean scanning every message against every trigger.
 */
export async function onTriggerMessage(message: Message): Promise<void> {
    if (message.author.bot || message.webhookId) return;
    if (!message.guild) return;
    if (!(await isFeatureEnabled(message.guild.id, "reply"))) return;

    const trigger = message.content.trim();
    if (!trigger) return;

    // Cached membership test first: almost no message is a trigger, and this keeps the common
    // case in memory instead of a query per message.
    if (!(await ReplyRepository.hasTrigger(message.guild.id, trigger))) return;

    const reply = await ReplyRepository.getRandomReply(message.guild.id, trigger);
    if (!reply) return;

    if (!message.channel.isSendable()) return;

    await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(err => {
        Logger.warn(`Could not send auto-reply for "${trigger}" in ${message.guild!.id}: ${err}`, CTX);
    });
}
