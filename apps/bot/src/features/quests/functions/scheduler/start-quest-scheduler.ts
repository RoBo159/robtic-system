import type { Client } from "discord.js";
import { QUEST_CONFIG } from "@constants";
import { startQuestProgress, stopQuestProgress, setQuestNotifier } from "@core/quests";
import { Logger } from "@logger";
import { runQuestCycle } from "./run-quest-cycle";
import { resumeCommunityPanels } from "../community/resume-community-panels";
import { registerQuestNotifier } from "../notify-member";

const CTX = "quests";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Guards against a cycle that outruns its interval.
 *
 * The cycle does per-guild IO and can exceed a minute on a large install. The combo scheduler has
 * no such guard and can overlap silently; that is a bug not to copy.
 */
let running = false;

export function startQuestScheduler(client: Client): void {
    if (timer) return;

    startQuestProgress();

    // Before the first cycle: expiry runs inside it, and a claim that resolves on that pass should
    // reach the member rather than fall into an unregistered notifier.
    registerQuestNotifier(client);

    // Re-attach to live challenge embeds before the first cycle, so a restart mid-week keeps
    // editing the same message rather than posting a second one.
    void resumeCommunityPanels(client).catch(err =>
        Logger.warn(`Could not resume community panels: ${err}`, CTX)
    );

    timer = setInterval(() => void tick(client), QUEST_CONFIG.tickIntervalMs);
    void tick(client);

    Logger.info("Quest scheduler started", CTX);
}

async function tick(client: Client): Promise<void> {
    if (running) return;
    running = true;

    try {
        await runQuestCycle(client);
    } catch (err) {
        Logger.error(`Quest cycle threw: ${err}`, CTX);
    } finally {
        running = false;
    }
}

export function stopQuestScheduler(): void {
    if (timer) clearInterval(timer);
    timer = null;
    stopQuestProgress();
    // Dropped with the client it was bound to, so a reload cannot DM through a dead one.
    setQuestNotifier(null);
}
