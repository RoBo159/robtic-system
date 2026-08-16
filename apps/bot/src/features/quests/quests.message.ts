import type { MessageCommandConfig } from "@typings/message-command";
import { buildActiveQuestsEmbed } from "./utils/active-quests-embed";

/**
 * A bare `?quest` — or `?quests` — shows what this member is working on.
 *
 * The alternative was the parser's "missing subcommand" error, which is a poor answer to the most
 * likely question: someone who saw a quest posted and typed the word they just read almost always
 * means "what am I on, and how far along". `/quest active` is the same view; this only removes the
 * need to know that.
 *
 * Anything with arguments falls through to the normal pipeline, so `?quest board` and `?quest top`
 * still work.
 */
export default {
    name: "quest",
    aliases: ["quests"],
    feature: "quests",
    async run({ message, argString }) {
        if (argString.trim()) return false;
        if (!message.guild) return false;

        const embed = await buildActiveQuestsEmbed(message.guild.id, message.author.id);
        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);

        return true;
    },
} satisfies MessageCommandConfig;
