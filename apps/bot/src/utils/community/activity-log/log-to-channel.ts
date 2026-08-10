import type { Client, EmbedBuilder, TextChannel } from "discord.js";
import { Logger } from "@logger";
import { ACTIVITY_LOG_KEY_MAP, type ActivityLogChannel } from "@constants";
import { getLogChannel } from "@bot/utils/server-log";

const CTX = "activity:log";

export async function logToChannel(
    client: Client,
    type: ActivityLogChannel,
    embed: EmbedBuilder,
): Promise<void> {
    try {
        const channel = await getLogChannel(client, ACTIVITY_LOG_KEY_MAP[type]) as TextChannel | null;
        if (!channel) return;
        await channel.send({ embeds: [embed] });
    } catch (err) {
        Logger.debug(`Failed to send activity log (${type}): ${err}`, CTX);
    }
}
