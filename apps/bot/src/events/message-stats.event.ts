import { Events, type Message } from "discord.js";
import { ActivityRepository, PeriodicStatRepository } from "@database/repositories";
import { isAcceptableMessage } from "@utils";
import { MESSAGE_STATS_CONFIG } from "@constants";
import { handleError, BotError } from "@core/handlers";
import { awardMessageCoin } from "@core/coins";

/**
 * Counts every "real" message a user sends, guild-wide — unlike XP, this has no channel/role
 * restriction and no per-user cooldown, only the shared spam/short-message quality gate. Feeds
 * ActivityXP.realMessageCount (/profile) and the periodic Messages leaderboard (/top).
 */
export default {
    name: Events.MessageCreate,

    async execute(message: Message) {
        if (message.author.bot || message.webhookId) return;
        if (!message.guild) return;

        const content = message.content.trim();
        if (!isAcceptableMessage(content, MESSAGE_STATS_CONFIG.minMessageLength)) return;

        try {
            await ActivityRepository.incrementRealMessageCount(message.author.id, message.guild.id, message.author.username);
            await PeriodicStatRepository.incrementAllPeriods(message.guild.id, "messages", message.author.id, 1);
            await awardMessageCoin(message.guild.id, message.author.id, message.author.username);
        } catch (err) {
            handleError(new BotError(`Failed to process message stats: ${err}`, "EVENT"), "main/message-stats");
        }
    },
};
