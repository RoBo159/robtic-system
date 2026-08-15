import type { Guild, TextChannel } from "discord.js";
import { XPSettingsRepository } from "@database/repositories";
import { LEVEL_UP_MESSAGES } from "@constants";
import { Logger } from "@logger";

const CTX = "main:xp";

/**
 * Posts a level-up to the configured channel.
 *
 * Silent when no channel is set — unlike streaks, which fall back to replying in place, an XP
 * level-up has no single channel it "belongs" to and announcing it wherever the member happened to
 * be typing would be noise in the middle of a conversation.
 */
export async function announceLevelUp(guild: Guild, userId: string, level: number): Promise<void> {
    const settings = await XPSettingsRepository.get(guild.id);
    if (!settings?.levelUpChannelId) return;

    const channel = guild.channels.cache.get(settings.levelUpChannelId)
        ?? await guild.channels.fetch(settings.levelUpChannelId).catch(() => null);

    if (!channel?.isTextBased()) {
        Logger.warn(`Level-up channel ${settings.levelUpChannelId} in ${guild.id} is missing or not text`, CTX);
        return;
    }

    await (channel as TextChannel).send({
        content: LEVEL_UP_MESSAGES.reached(userId, level),
        allowedMentions: { users: [userId] },
    }).catch(err => {
        Logger.warn(`Could not post level-up announcement in ${settings.levelUpChannelId}: ${err}`, CTX);
    });
}
