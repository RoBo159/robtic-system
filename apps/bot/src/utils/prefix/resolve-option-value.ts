import { ApplicationCommandOptionType, type Message, type User, type Role, type GuildBasedChannel } from "discord.js";
import type { OptionJSON } from "@typings/prefix";
import {
    BOOLEAN_TRUE_TOKENS,
    BOOLEAN_FALSE_TOKENS,
    SNOWFLAKE_REGEX,
    USER_MENTION_REGEX,
    ROLE_MENTION_REGEX,
    CHANNEL_MENTION_REGEX,
} from "@constants";

export async function resolveOptionValue(message: Message, opt: OptionJSON, token: string): Promise<unknown> {
    switch (opt.type) {
        case ApplicationCommandOptionType.String:
            return token;

        case ApplicationCommandOptionType.Integer:
        case ApplicationCommandOptionType.Number: {
            const n = Number(token);
            return Number.isFinite(n) ? n : undefined;
        }

        case ApplicationCommandOptionType.Boolean: {
            const v = token.toLowerCase();
            if ((BOOLEAN_TRUE_TOKENS as readonly string[]).includes(v)) return true;
            if ((BOOLEAN_FALSE_TOKENS as readonly string[]).includes(v)) return false;
            return undefined;
        }

        case ApplicationCommandOptionType.User: {
            const match = token.match(USER_MENTION_REGEX);
            const id = match ? match[1] : token;
            if (!SNOWFLAKE_REGEX.test(id)) return undefined;
            const member = message.guild ? await message.guild.members.fetch(id).catch(() => null) : null;
            const user: User | null = member?.user ?? (await message.client.users.fetch(id).catch(() => null));
            return user ?? undefined;
        }

        case ApplicationCommandOptionType.Role: {
            const match = token.match(ROLE_MENTION_REGEX);
            const id = match ? match[1] : token;
            if (!SNOWFLAKE_REGEX.test(id)) return undefined;
            const role: Role | null | undefined =
                message.guild?.roles.cache.get(id) ?? (await message.guild?.roles.fetch(id).catch(() => null));
            return role ?? undefined;
        }

        case ApplicationCommandOptionType.Channel: {
            const match = token.match(CHANNEL_MENTION_REGEX);
            const id = match ? match[1] : token;
            if (!SNOWFLAKE_REGEX.test(id)) return undefined;
            const channel: GuildBasedChannel | null | undefined =
                message.guild?.channels.cache.get(id) ?? (await message.guild?.channels.fetch(id).catch(() => null));
            if (!channel) return undefined;
            if (opt.channel_types?.length && !opt.channel_types.includes(channel.type)) return undefined;
            return channel;
        }

        default:
            return undefined;
    }
}
