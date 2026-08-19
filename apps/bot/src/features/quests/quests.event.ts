import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { QuestSettingsRepository } from "@database/repositories";
import { forgetGuildClaims, forgetGuildChallenge } from "@core/quests";
import { Logger } from "@logger";
import { startQuestScheduler } from "./functions/scheduler/start-quest-scheduler";
import { migrateQuestChannels } from "./functions/migrate-quest-channels";

const CTX = "quests";

/**
 * The feature owns its own listeners, including the `clientReady` that starts the engine.
 *
 * There is no `messageCreate` here, and there should never be one: progress arrives on the metric
 * bus, published by the systems that already own each number. A listener of our own would count
 * messages a second time and disagree with the message counter the moment either changed.
 */
export default [
    {
        name: Events.ClientReady,
        once: true,
        execute: async client => {
            // Before the scheduler, so the first cycle already reads the folded channel rather than
            // posting nowhere for one tick.
            await migrateQuestChannels();
            startQuestScheduler(client);
        },
    } satisfies EventConfig<Events.ClientReady>,

    /**
     * Drops a departed guild's in-memory state.
     *
     * Nothing is deleted from the database — quests are permanent history and the guild may come
     * back — but the claim cache, the active-challenge map and the settings cache would otherwise
     * hold rows for a server the bot can no longer see, and the challenge entry would keep feeding
     * a metric that can never be settled.
     */
    {
        name: Events.GuildDelete,
        execute: guild => {
            forgetGuildClaims(guild.id);
            forgetGuildChallenge(guild.id);
            QuestSettingsRepository.invalidate(guild.id);
            Logger.debug(`Dropped quest state for departed guild ${guild.id}`, CTX);
        },
    } satisfies EventConfig<Events.GuildDelete>,
];
