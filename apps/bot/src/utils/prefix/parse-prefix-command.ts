import type { Message } from "discord.js";

/** Splits a message into `{commandName, argString}` if it starts with the guild's prefix, else null. */
export function parsePrefixCommand(message: Message, prefix: string): { commandName: string; argString: string } | null {
    if (!message.content.startsWith(prefix)) return null;

    const withoutPrefix = message.content.slice(prefix.length);
    const spaceIdx = withoutPrefix.search(/\s/);
    const commandName = (spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx)).toLowerCase();
    if (!commandName) return null;

    const argString = spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1);
    return { commandName, argString };
}
