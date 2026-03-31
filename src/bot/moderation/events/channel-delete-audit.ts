import { AuditLogEvent, EmbedBuilder, Events, type GuildChannel } from "discord.js";
import { Colors } from "@core/config";
import { recordSecurityEvent, sendAuditLog } from "../utils/security";
import type { BotClient } from "@core/BotClient";

export default {
    name: Events.ChannelDelete,
    async execute(channel: GuildChannel, client: BotClient) {
        const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find((item) => Date.now() - item.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Channel Deleted")
            .setColor(Colors.error)
            .addFields(
                { name: "Channel", value: `${channel.name} (${channel.id})` },
                { name: "Type", value: channel.type.toString(), inline: true },
                { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
            )
            .setTimestamp();

        await sendAuditLog(channel.guild, "channel_delete", embed);

        if (executorId) {
            await recordSecurityEvent({
                client,
                guild: channel.guild,
                event: "channel_delete",
                executorId,
                targetId: channel.id,
                source: "event:channelDelete",
                details: `channel=${channel.name}`,
            });
        }
    },
};
