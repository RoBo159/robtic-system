import { Events, type Message, type GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { SHORTCUT_REPLY_LIFETIME_MS } from "@constants";
import { ChatUtils } from "../utils/moderation/chat";
import { findShortcutMatch, runCustomCommandShortcut } from "../utils/prefix";
import { hasFullPower } from "../utils/access";

const CHAT_UTIL_COMMANDS = new Set(Object.keys(ChatUtils));

/**
 * The single listener for `/shortcut add` triggers.
 *
 * A shortcut resolves to one of two things: a channel-utility action (lock/unlock/hide/show/
 * slowmode/clear), which has no slash command behind it and is gated by ManageChannels here; or a
 * real command, which runs through the same schema-driven pipeline as `!command` with that
 * command's own permission check.
 */
export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (!message.guild || message.author.bot || !message.member) return;

        const match = await findShortcutMatch(message.guild.id, message.content.trim());
        if (!match) return;

        if (!CHAT_UTIL_COMMANDS.has(match.command)) {
            await runCustomCommandShortcut(message, client, match);
            return;
        }

        if (!hasFullPower(message.member) && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;

        const channel = message.channel as GuildTextBasedChannel;
        const commandName = match.command as keyof typeof ChatUtils;

        try {
            const result = await runChatUtil(commandName, channel, match.args, message);
            if (!result) return;

            // `clear` deletes the triggering message along with the rest, so its confirmation has to
            // be a plain channel send rather than a reply to a message that no longer exists.
            const notice = commandName === "clear"
                ? await channel.send({ content: `${result}` })
                : await message.reply({ content: `${result}` });

            setTimeout(() => notice.delete().catch(() => null), SHORTCUT_REPLY_LIFETIME_MS);
        } catch (error) {
            Logger.error(`Error executing shortcut "${match.trigger}": ${error}`, client.botName);
        }
    },
};

async function runChatUtil(
    commandName: keyof typeof ChatUtils,
    channel: GuildTextBasedChannel,
    args: string,
    message: Message,
): Promise<string | null> {
    switch (commandName) {
        case "slowmode":
            return ChatUtils.slowmode(channel, args || "0");
        case "clear": {
            const amount = Number.parseInt(args, 10);
            return ChatUtils.clear(channel, Number.isNaN(amount) ? 100 : amount);
        }
        default:
            return ChatUtils[commandName](channel, message.guild!);
    }
}
