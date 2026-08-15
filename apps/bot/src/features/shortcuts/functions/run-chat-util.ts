import { PermissionFlagsBits, type GuildMember, type GuildTextBasedChannel, type Message } from "discord.js";
import { ChatUtils } from "@bot/utils/moderation/chat";
import { isGuildOperator } from "@bot/utils/access";
import { scheduleShortcutCleanup } from "@bot/utils/prefix";
import type { ShortcutDeleteMode } from "@constants";
import { Logger } from "@logger";

const CTX = "shortcuts";

export const CHAT_UTIL_COMMANDS = new Set(Object.keys(ChatUtils));

/**
 * Runs a channel-utility shortcut (lock/unlock/hide/show/slowmode/clear).
 *
 * These have no slash command behind them, so there is no command-level permission check to
 * inherit — the ManageChannels gate here is the only one, on top of whatever role restriction the
 * shortcut itself carries.
 */
export async function runChatUtilShortcut(
    message: Message,
    member: GuildMember,
    command: string,
    args: string,
    deleteMode: ShortcutDeleteMode,
): Promise<boolean> {
    if (!isGuildOperator(member) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) return false;

    const channel = message.channel as GuildTextBasedChannel;
    const key = command as keyof typeof ChatUtils;

    try {
        const result = await execute(key, channel, args, message);
        if (!result) return false;

        // `clear` deletes the triggering message along with the rest, so its confirmation has to be
        // a plain channel send rather than a reply to a message that no longer exists.
        const notice = key === "clear"
            ? await channel.send({ content: result })
            : await message.reply({ content: result });

        scheduleShortcutCleanup(message, notice, deleteMode);
        return true;
    } catch (error) {
        Logger.error(`Chat-utility shortcut "${command}" failed: ${error}`, CTX);
        return false;
    }
}

function execute(
    key: keyof typeof ChatUtils,
    channel: GuildTextBasedChannel,
    args: string,
    message: Message,
): Promise<string | null> {
    if (key === "slowmode") return ChatUtils.slowmode(channel, args || "0");

    if (key === "clear") {
        const amount = Number.parseInt(args, 10);
        return ChatUtils.clear(channel, Number.isNaN(amount) ? 100 : amount);
    }

    return ChatUtils[key](channel, message.guild!);
}
