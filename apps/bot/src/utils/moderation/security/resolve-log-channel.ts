import type { Guild, GuildTextBasedChannel } from "discord.js";

export async function resolveLogChannel(guild: Guild, channelId: string): Promise<GuildTextBasedChannel | null> {
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel as GuildTextBasedChannel;
}
