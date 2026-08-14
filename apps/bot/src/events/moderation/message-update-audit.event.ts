import { EmbedBuilder, Events, type Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { sendToServerLog } from "@bot/utils/server-log";

export default {
    name: Events.MessageUpdate,
    async execute(oldMessage: Message, newMessage: Message, client: BotClient) {
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;

        const truncate = (s: string, max = 1024) => s.length > max ? s.slice(0, max - 3) + "..." : s;

        const embed = new EmbedBuilder()
            .setTitle("📘 Audit: Message Edited")
            .setColor(COLORS.warning)
            .addFields(
                { name: "Author", value: `<@${newMessage.author.id}> (\`${newMessage.author.id}\`)`, inline: true },
                { name: "Channel", value: `${newMessage.channel.toString()} (\`${newMessage.channelId}\`)`, inline: true },
                { name: "Before", value: truncate(oldMessage.content || "(empty)") },
                { name: "After", value: truncate(newMessage.content || "(empty)") },
                { name: "Link", value: `[Jump to message](${newMessage.url})`, inline: true },
            )
            .setTimestamp();

        await sendToServerLog(client, newMessage.guild.id, "message-update", embed);
    },
};
