import { MessageFlags, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { IAdsConfig } from "@database/models/AdsConfig";
import { buildAdsPanel } from "./ads-panels";

export async function refreshAdsPanel(client: BotClient, config: IAdsConfig): Promise<void> {
    if (!config.panelChannelId || !config.panelMessageId) return;

    const channel = client.channels.cache.get(config.panelChannelId) as TextChannel | undefined;
    if (!channel) return;

    const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    if (!message) return;

    const { components, files } = buildAdsPanel(config);
    await message.edit({ components, files, flags: MessageFlags.IsComponentsV2 });
}
