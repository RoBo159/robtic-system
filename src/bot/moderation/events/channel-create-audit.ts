import { AuditLogEvent, Events, type GuildChannel } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { getModerationSecurityConfig, resolveLogChannel, recordSecurityEvent } from "../utils/security";
import { channelCreateEmbed } from "../utils/embed";

export default {
    name: Events.ChannelCreate,
    async execute(channel: GuildChannel, client: BotClient) {
        const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find((item) => Date.now() - item.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;


        const config = await getModerationSecurityConfig(channel.guild.id);
        const channelId = config.settings.auditChannels.channel_create;
        if (channelId) {
            const logChannel = await resolveLogChannel(channel.guild, channelId);
            if (logChannel) {
                await logChannel.send({ embeds: [channelCreateEmbed(channel, executorId ?? null)] }).catch(() => null);
            }
        }

        if (executorId) {
            await recordSecurityEvent({
                client,
                guild: channel.guild,
                event: "channel_create",
                executorId,
                targetId: channel.id,
                source: "event:channelCreate",
                details: `channel=${channel.name}`,
            });
        }
    },
};
