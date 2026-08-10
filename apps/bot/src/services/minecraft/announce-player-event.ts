import { EmbedBuilder, escapeMarkdown, type Client } from "discord.js";
import { MinecraftConfigRepository } from "@database/repositories";
import { COLORS } from "@constants";
import { Logger } from "@logger";

interface PlayerPayload {
    username?: string;
    serverKey?: string;
    linked?: boolean;
}

/** Join/quit notices in the bridged channel, kept compact as a coloured author-only embed. */
export async function announcePlayerEvent(
    client: Client,
    guildId: string,
    kind: "player_join" | "player_quit",
    payload: Record<string, unknown>,
): Promise<void> {
    const { username, serverKey, linked } = payload as PlayerPayload;
    if (!username) return;

    const config = await MinecraftConfigRepository.get(guildId);
    if (!config?.chatChannelId || !config.chatBridgeEnabled) return;

    const channel = await client.channels.fetch(config.chatChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;

    const joined = kind === "player_join";
    const suffix = joined && linked === false ? " (unlinked)" : "";

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${joined ? "→" : "←"} ${escapeMarkdown(username)} ${joined ? "joined" : "left"}${suffix}` })
        .setColor(joined ? COLORS.success : COLORS.error)
        .setFooter({ text: serverKey ?? "minecraft" });

    await channel
        .send({ embeds: [embed], allowedMentions: { parse: [] } })
        .catch(error => Logger.warn(`Failed to announce player event: ${error}`, "Minecraft"));
}
