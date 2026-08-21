import type { GuildMember, GuildTextBasedChannel, Message } from "discord.js";
import { ChatUtils } from "@bot/utils/moderation/chat";
import { hasModerationAccess } from "@bot/utils/access";
import { scheduleShortcutCleanup } from "@bot/utils/prefix";
import { STAFF_TIER_THRESHOLDS, type ShortcutDeleteMode } from "@constants";
import { Logger } from "@logger";
import { parseChatUtilArgs, type ChatUtilArgs, type ChatUtilKey } from "./parse-chat-util-args";

const CTX = "shortcuts";

export const CHAT_UTIL_COMMANDS = new Set(Object.keys(ChatUtils));

/** The slash command these utilities also live behind — so one /command-access grant covers both. */
const CHAT_COMMAND_NAME = "chat";

/**
 * Runs a channel-utility shortcut (lock/unlock/hide/show/slowmode/clear).
 *
 * These have no slash command behind them, so there is no command-level permission check to
 * inherit — hasModerationAccess stands in for it, on the same terms /chat is gated on, and on top
 * of whatever role restriction the shortcut itself carries.
 *
 * Arguments are parsed before anything is checked or done. Returning false means "this message was
 * not an invocation": the caller says nothing, because a member who wrote a sentence beginning with
 * a one-letter trigger did not ask for a channel utility and should not be told about one.
 */
export async function runChatUtilShortcut(
    message: Message,
    member: GuildMember,
    command: string,
    args: string,
    deleteMode: ShortcutDeleteMode,
): Promise<boolean> {
    const key = command as ChatUtilKey;
    const invokedIn = message.channel as GuildTextBasedChannel;

    const parsed = await parseChatUtilArgs(key, args, invokedIn, message.guild!);
    if (!parsed) return false;

    if (!(await hasModerationAccess(member, CHAT_COMMAND_NAME, STAFF_TIER_THRESHOLDS.staff))) return false;

    try {
        const result = await execute(key, parsed, message);
        if (!result) return false;

        const clearedHere = key === "clear" && parsed.channel.id === invokedIn.id;
        const notice = clearedHere
            ? await invokedIn.send({ content: result })
            : await message.reply({ content: result });

        scheduleShortcutCleanup(message, notice, deleteMode);
        return true;
    } catch (error) {
        Logger.error(`Chat-utility shortcut "${command}" failed: ${error}`, CTX);
        return false;
    }
}

function execute(key: ChatUtilKey, args: ChatUtilArgs, message: Message): Promise<string | null> {
    if (key === "slowmode") return ChatUtils.slowmode(args.channel, args.duration);
    if (key === "clear") return ChatUtils.clear(args.channel, args.amount);
    return ChatUtils[key](args.channel, message.guild!);
}
