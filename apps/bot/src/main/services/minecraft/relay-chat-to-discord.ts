import { escapeMarkdown, type Client } from "discord.js";
import { MinecraftConfigRepository } from "@database/repositories";
import { MINECRAFT_BRIDGE } from "@constants";
import { Logger } from "@logger";

interface ChatPayload {
    username?: string;
    message?: string;
    serverKey?: string;
}

/**
 * Posts one in-game chat line into the bridged Discord channel. Sent as plain text (not an embed)
 * so it reads like chat, with mentions disabled — a player must not be able to ping the server
 * from Minecraft.
 */
export async function relayChatToDiscord(
    client: Client,
    guildId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const { username, message } = payload as ChatPayload;
    if (!username || !message) return;

    const config = await MinecraftConfigRepository.get(guildId);
    if (!config?.chatChannelId || !config.chatBridgeEnabled) return;

    const channel = await client.channels.fetch(config.chatChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;

    const text = escapeMarkdown(message.slice(0, MINECRAFT_BRIDGE.maxChatLength));
    const name = escapeMarkdown(username);

    await channel
        .send({
            content: `\`[MC]\` **${name}** ${text}`,
            allowedMentions: { parse: [] },
        })
        .catch(error => Logger.warn(`Failed to relay Minecraft chat: ${error}`, "Minecraft"));
}
