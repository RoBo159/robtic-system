import { Events } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { BRANCH_CONFIG } from "@config";
import { setPresence } from "../utils/set-presence";
import { setupGuildGuard } from "../guards/setup-guild-guard";
import { reportOrphanShortcuts } from "../guards/report-orphan-shortcuts";
import { startMinecraftScheduler } from "../services/minecraft";
import { startDecayScheduler } from "../services/community/decay";
import { startSessionCleanupScheduler } from "../services/community/support";

/**
 * Bot-wide startup: presence, the guild guard, and the schedulers for systems that are not yet
 * features.
 *
 * Six near-identical copies of this used to exist, one per merged bot, so the guild guard attached
 * its `guildCreate` listener five times over and each copy overwrote the previous one's presence.
 * Hence one handler for anything bot-wide — but a *feature* brings its own ready listener for its
 * own scheduler, because a file here importing into `features/` would break the rule that a
 * feature folder can be deleted on its own.
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
        await reportOrphanShortcuts(client);

        startMinecraftScheduler(client);
        startDecayScheduler(client);
        startSessionCleanupScheduler();
    },
};
