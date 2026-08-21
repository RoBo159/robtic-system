import type { Client } from "discord.js";
import { QuestRepository } from "@database/repositories";
import { isFeatureEnabled } from "@core/features";
import { planGeneration, fireDueGenerations, expireDueClaims } from "@core/quests";
import { Logger } from "@logger";
import { postQuest } from "../post-quest";
import { runCommunityCycle, flushCommunityProgress } from "../community/run-community-cycle";

const CTX = "quests";

/**
 * One pass of the engine.
 *
 * Ordered because the steps depend on each other: expiring a claim frees the member to take the
 * quest generation is about to post, and reclaiming a stale lease has to happen before anything
 * tries to lease again.
 */
export async function runQuestCycle(client: Client): Promise<void> {
    const now = new Date();

    try {
        const summary = await expireDueClaims(now);
        if (summary.expired || summary.rescued || summary.resumed) {
            Logger.debug(
                `Quest claims — expired ${summary.expired}, rescued ${summary.rescued}, resumed ${summary.resumed}`,
                CTX,
            );
        }
    } catch (err) {
        Logger.warn(`Quest claim expiry failed: ${err}`, CTX);
    }

    for (const [, guild] of client.guilds.cache) {
        try {
            if (!(await isFeatureEnabled(guild.id, "quests"))) continue;

            await planGeneration(guild.id, now);
            await runCommunityCycle(client, guild, now);
        } catch (err) {
            Logger.warn(`Quest cycle failed for ${guild.id}: ${err}`, CTX);
        }
    }

    try {
        await fireDueGenerations(quest => postQuest(client, quest), now);
    } catch (err) {
        Logger.warn(`Quest generation failed: ${err}`, CTX);
    }

    try {
        await flushCommunityProgress(client);
    } catch (err) {
        Logger.warn(`Community contribution flush failed: ${err}`, CTX);
    }

    try {
        await expireFinishedQuests(now);
        await QuestRepository.reconcileSlots();
    } catch (err) {
        Logger.warn(`Quest housekeeping failed: ${err}`, CTX);
    }
}

/** Closes quests whose time is up, so the board stops offering them. */
async function expireFinishedQuests(now: Date): Promise<void> {
    const due = await QuestRepository.findDueToExpire(now);
    for (const quest of due) {
        await QuestRepository.markExpired(quest._id);
    }
}
