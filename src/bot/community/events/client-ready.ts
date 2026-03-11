import { Events } from "discord.js";
import type { BotClient } from "@core/BotClient.ts";
import { Logger } from "@core/libs";
import { setPresence, setupGuildGuard } from "@shared/index";
import { startDecayScheduler } from "../services/decay-service";
import { startSessionCleanupScheduler } from "../services/support-service";

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        Logger.success(`Logged in as ${client.user?.tag}`, client.botName);
        Logger.debug(`Bot ID: ${client.user?.id}`, client.botName);
        Logger.debug(`Serving ${client.guilds.cache.size} guild(s)`, client.botName);

        const activityNames = [
            "Tracking community activity 📊",
            "Leveling up members ⬆️",
            "Monitoring staff performance 🏆",
            "XP system online 🎮",
        ];
        setPresence(client, "online", "Watching", activityNames);
        setupGuildGuard(client);
        startDecayScheduler(client);
        startSessionCleanupScheduler();
    },
};
