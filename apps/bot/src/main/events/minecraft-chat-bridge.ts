import { Events, type Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { MinecraftConfigRepository } from "@database/repositories";
import { MINECRAFT_BRIDGE } from "@constants";
import { publishBridgeEvent } from "@core/minecraft";

/**
 * Relays the bridged channel into Minecraft. Bot and webhook messages are dropped, which is what
 * stops the loop: everything this integration posts back into the channel comes from the bot
 * account, so it can never be re-queued for the game server.
 */
export default {
    name: Events.MessageCreate,

    async execute(message: Message, _client: BotClient) {
        if (message.author.bot || message.webhookId) return;
        if (!message.guild) return;
        if (!message.content.trim() && message.attachments.size === 0) return;

        const config = await MinecraftConfigRepository.get(message.guild.id);
        if (!config?.chatBridgeEnabled || config.chatChannelId !== message.channel.id) return;

        const content = message.cleanContent.trim().slice(0, MINECRAFT_BRIDGE.maxChatLength);
        const attachmentNote = message.attachments.size > 0 ? ` [${message.attachments.size} attachment(s)]` : "";

        await publishBridgeEvent({
            guildId: message.guild.id,
            type: "chat",
            serverKey: null,
            payload: {
                discordId: message.author.id,
                username: message.member?.displayName ?? message.author.username,
                message: `${content}${attachmentNote}`.trim(),
            },
        });
    },
};
