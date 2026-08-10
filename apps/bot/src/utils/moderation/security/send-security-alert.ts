import type { EmbedBuilder, Guild } from "discord.js";
import { getModerationSecurityConfig } from "./get-moderation-security-config";
import { resolveLogChannel } from "./resolve-log-channel";

export async function sendSecurityAlert(guild: Guild, embed: EmbedBuilder): Promise<void> {
    const config = await getModerationSecurityConfig(guild.id);
    const channel = await resolveLogChannel(guild, config.settings.securityLogChannelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => null);
}
