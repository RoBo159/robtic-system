import { Events, type Message, type MessageReaction, type User } from "discord.js";
import { touchActivity } from "@core/activity";

/**
 * Marks a member as present whenever they do something deliberate.
 *
 * One listener for the message and reaction paths rather than a `touchActivity` call sprinkled
 * through every feature — presence is a cross-cutting fact, and scattering it would mean a new
 * feature silently failing to keep its users out of AFK.
 *
 * Costs nothing per event: the tracker is an in-memory map, flushed on a timer.
 */
export default [
    {
        name: Events.MessageCreate,
        execute: (message: Message) => {
            if (message.author.bot || !message.guild) return;
            touchActivity(message.guild.id, message.author.id, "message");
        },
    },
    {
        name: Events.MessageReactionAdd,
        execute: (reaction: MessageReaction, user: User) => {
            const guildId = reaction.message.guild?.id;
            if (!guildId || user.bot) return;
            touchActivity(guildId, user.id, "reaction");
        },
    },
];
