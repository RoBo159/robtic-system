import { Events } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { BRANCH_CONFIG } from "@config";
import { setPresence } from "../utils/set-presence";
import { setupGuildGuard } from "../guards/setup-guild-guard";
import { startStreakScheduler } from "../services/streak-scheduler";
import { startComboScheduler } from "../services/combo-scheduler";
import { startMinecraftScheduler } from "../services/minecraft";
import { startDecayScheduler } from "../services/community/decay";
import { startSessionCleanupScheduler } from "../services/community/support";

/**
 * The one ready handler for the whole bot.
 *
 * Every system used to bring its own — six listeners on what was, in practice, a single merged
 * client — so the guild guard registered its `guildCreate` listener five times over and each
 * system overwrote the previous one's presence a moment after setting it.
 */
export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        Logger.success(`Logged in as ${client.user?.tag}`, client.botName);
        Logger.debug(`Bot ID: ${client.user?.id}`, client.botName);
        Logger.debug(`Serving ${client.guilds.cache.size} guild(s)`, client.botName);

        setPresence(client, "dnd", "Playing", [...BRANCH_CONFIG.presence]);
        await setupGuildGuard(client);

        startStreakScheduler(client);
        startComboScheduler(client);
        startMinecraftScheduler(client);
        startDecayScheduler(client);
        startSessionCleanupScheduler();
    },
};
