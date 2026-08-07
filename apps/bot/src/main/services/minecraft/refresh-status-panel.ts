import type { Client } from "discord.js";
import { MinecraftConfigRepository, MinecraftServerRepository, ServerConfigRepository } from "@database/repositories";
import { Logger } from "@logger";
import { buildServerStatusEmbed } from "../../utils/minecraft";

const PANEL_KEY = "minecraft_status";

/**
 * Re-renders the guild's server status panel in place, posting a new message only when there is no
 * usable one. Reuses the existing `sentPanels` bookkeeping on ServerConfig so the panel survives
 * restarts the same way every other persistent panel in the system does.
 */
export async function refreshStatusPanel(client: Client, guildId: string): Promise<void> {
    const config = await MinecraftConfigRepository.get(guildId);
    if (!config?.statusChannelId) return;

    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;

    const servers = await MinecraftServerRepository.list(guildId);
    const embed = buildServerStatusEmbed(servers);
    const existing = await ServerConfigRepository.getSentPanelByKey(guildId, PANEL_KEY);

    if (existing && existing.channelId === config.statusChannelId) {
        const message = await channel.messages.fetch(existing.messageId).catch(() => null);
        if (message) {
            await message.edit({ embeds: [embed] }).catch(error =>
                Logger.warn(`Failed to edit Minecraft status panel: ${error}`, "Minecraft")
            );
            return;
        }
        await ServerConfigRepository.removeSentPanel(guildId, existing.messageId);
    }

    const message = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!message) return;

    await ServerConfigRepository.upsertSentPanel(guildId, {
        panelKey: PANEL_KEY,
        channelId: config.statusChannelId,
        messageId: message.id,
        sentBy: client.user?.id ?? "system",
    });
}
