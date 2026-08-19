import type { Guild, GuildTextBasedChannel } from "discord.js";
import { CHANNEL_MENTION_REGEX, SNOWFLAKE_REGEX } from "@constants";
import type { ChatUtils } from "@bot/utils/moderation/chat";

export type ChatUtilKey = keyof typeof ChatUtils;

export interface ChatUtilArgs {
    /** The channel to act on — the one the trigger was typed in unless the member named another. */
    channel: GuildTextBasedChannel;
    /** `clear` only. */
    amount: number;
    /** `slowmode` only. */
    duration: string;
}

/** `5s`, `10m`, `2h`, or a bare count of seconds. Mirrors what ChatUtils.slowmode accepts. */
const DURATION_TOKEN = /^\d+(s|m|h)?$/;
const COUNT_TOKEN = /^\d+$/;

/** What `clear` wipes when the member names no number. `bulkDelete` caps at 100 regardless. */
const DEFAULT_CLEAR_AMOUNT = 100;

/**
 * Reads a channel-utility shortcut's arguments, or returns null when the message is not actually an
 * invocation.
 *
 * The null case is the point. A trigger matches on a word boundary, so a one-letter trigger like `l`
 * claims every sentence starting "l " — and these utilities used to ignore their arguments
 * completely, which made "l ike i said earlier" lock the channel and "c ould you check this" wipe a
 * hundred messages. Nothing is accepted here beyond what the command can actually use, so anything
 * that reads as ordinary prose falls through to null and the caller stays silent.
 *
 * Arguments are matched by shape rather than position, so `c 20 #general` and `c #general 20` both
 * work; naming the same kind of argument twice is a mistake rather than an invocation.
 */
export async function parseChatUtilArgs(
    key: ChatUtilKey,
    args: string,
    /** Where the trigger was typed — the default target. */
    invokedIn: GuildTextBasedChannel,
    guild: Guild,
): Promise<ChatUtilArgs | null> {
    const tokens = args.trim().split(/\s+/).filter(Boolean);

    let channel = invokedIn;
    let amount = DEFAULT_CLEAR_AMOUNT;
    let duration: string | null = null;
    let namedChannel = false;
    let namedAmount = false;

    for (const token of tokens) {
        const channelId = token.match(CHANNEL_MENTION_REGEX)?.[1] ?? (SNOWFLAKE_REGEX.test(token) ? token : null);
        if (channelId) {
            if (namedChannel) return null;
            const resolved = await resolveChannel(guild, channelId);
            if (!resolved) return null;
            channel = resolved;
            namedChannel = true;
            continue;
        }

        if (key === "clear") {
            if (namedAmount || !COUNT_TOKEN.test(token)) return null;
            const count = Number.parseInt(token, 10);
            if (count < 1) return null;
            amount = count;
            namedAmount = true;
            continue;
        }

        if (key === "slowmode") {
            if (duration !== null || !DURATION_TOKEN.test(token)) return null;
            duration = token;
            continue;
        }

        // lock / unlock / hide / show take a channel and nothing else.
        return null;
    }

    // Required rather than defaulted to "0": a bare `slowmode` reads as "I meant to type a duration"
    // far more often than "turn slowmode off", and silently clearing it is the destructive guess.
    if (key === "slowmode" && duration === null) return null;

    return { channel, amount, duration: duration ?? "0" };
}

async function resolveChannel(guild: Guild, id: string): Promise<GuildTextBasedChannel | null> {
    const channel = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
    if (!channel || !channel.isTextBased()) return null;
    return channel as GuildTextBasedChannel;
}
