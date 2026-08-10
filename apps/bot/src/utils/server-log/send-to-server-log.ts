import { ChannelType, type Client, type EmbedBuilder, type TextChannel } from "discord.js";
import { GlobalConfigRepository } from "@database/repositories";

export async function sendToServerLog(
    client: Client,
    sourceGuildId: string,
    channelName: string,
    embed: EmbedBuilder,
): Promise<void> {
    const logGuildId = await GlobalConfigRepository.get("server_log_guild");
    if (!logGuildId) return;

    const logGuild = client.guilds.cache.get(logGuildId);
    if (!logGuild) return;

    const category = logGuild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name === sourceGuildId
    );
    if (!category) return;

    const channel = logGuild.channels.cache.find(
        c => c.parentId === category.id && c.name === channelName
    ) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    await channel.send({ embeds: [embed] }).catch(() => null);
}
