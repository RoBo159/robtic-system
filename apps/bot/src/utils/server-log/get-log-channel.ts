import { type Client, type TextChannel } from "discord.js";
import { LogConfigRepository } from "@database/repositories";
import type { LogKey } from "@constants";

export async function getLogChannel(client: Client, key: LogKey): Promise<TextChannel | null> {
    const config = await LogConfigRepository.findByKey(key);
    if (!config) return null;
    return (client.channels.cache.get(config.channelId) as TextChannel | undefined) ?? null;
}
