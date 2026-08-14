import { AuditLogEvent, EmbedBuilder, Events, type GuildChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.ChannelUpdate,
    async execute(oldChannel: GuildChannel, newChannel: GuildChannel, client: BotClient) {
        if (!newChannel.guild) return;

        const changes: string[] = [];
        if (oldChannel.name !== newChannel.name) changes.push(`Name: \`${oldChannel.name}\` → \`${newChannel.name}\``);
        if ("topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic) {
            changes.push(`Topic: \`${oldChannel.topic ?? "(none)"}\` → \`${newChannel.topic ?? "(none)"}\``);
        }
        if ("nsfw" in oldChannel && "nsfw" in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
            changes.push(`NSFW: ${oldChannel.nsfw} → ${newChannel.nsfw}`);
        }
        if (oldChannel.parentId !== newChannel.parentId) {
            const oldCat = oldChannel.parent?.name ?? "(none)";
            const newCat = newChannel.parent?.name ?? "(none)";
            changes.push(`Category: \`${oldCat}\` → \`${newCat}\``);
        }

        if (changes.length === 0) return;

        const logs = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 6 }).catch(() => null);
        const entry = logs?.entries.find(e => Date.now() - e.createdTimestamp < 15_000);
        const executorId = entry?.executor?.id;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Channel Updated")
            .setColor(COLORS.warning)
            .addFields(
                { name: "Channel", value: `${newChannel.toString()} (\`${newChannel.id}\`)` },
                { name: "Changes", value: changes.join("\n") },
                { name: "Executor", value: executorId ? `<@${executorId}> (${executorId})` : "Unknown", inline: true },
            )
            .setTimestamp();

        await sendToServerLog(client, newChannel.guild.id, "channel-update", embed);
    },
};
