import { Events } from "discord.js";
import type { BotClient } from "@core/BotClient.ts";
import { Logger } from "@core/libs";
import { setPresence, setupGuildGuard } from "@shared/index";

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        Logger.success(`Logged in as ${client.user?.tag}`, client.botName);
        Logger.debug(`Bot ID: ${client.user?.id}`, client.botName);
        Logger.debug(`Serving ${client.guilds.cache.size} guild(s)`, client.botName);

        const activityNames = [
            "Developer support system 🔥",
            "Debugging code with devs ⚙️",
            "Learning resources hub 📚",
            "Helping with dev projects 🚀",
        ]
        setPresence(client, "dnd", "Playing", activityNames)
        setupGuildGuard(client);
    },
};
