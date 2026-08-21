import { onMetric } from "@core/metrics";
import { QuestClaimRepository } from "@database/repositories";
import { QUEST_CONFIG } from "@constants";
import { Logger } from "@logger";
import { recordMetric, flushProgress, setCompletionHandler } from "./progress/buffer";
import { invalidateMemberClaims } from "./progress/claim-cache";
import { completeClaim } from "./claim/complete-claim";
import { contributeFromMetric } from "./community/track-contributions";
import type { ClaimRuntime } from "./progress/runtime";

const CTX = "quests";

let unsubscribeMetrics: (() => void) | null = null;
let unsubscribeMutations: (() => void) | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let shutdownBound = false;

/**
 * Connects the quest engine to the metric bus and starts the flush timer.
 *
 * Idempotent: calling it twice leaves one subscription and one timer, so a reload cannot end up
 * counting every metric twice.
 */
export function startQuestProgress(): void {
    if (unsubscribeMetrics) return;

    unsubscribeMetrics = onMetric(event => {
        recordMetric(event);
        contributeFromMetric(event);
    });

    unsubscribeMutations = QuestClaimRepository.onMutation(invalidateMemberClaims);

    setCompletionHandler(handleCompletions);

    flushTimer = setInterval(() => {
        void flushProgress().catch(err => Logger.warn(`Quest flush failed: ${err}`, CTX));
    }, QUEST_CONFIG.flushIntervalMs);

    bindShutdownFlush();
    Logger.info("Quest progress tracking started", CTX);
}

export function stopQuestProgress(): void {
    unsubscribeMetrics?.();
    unsubscribeMetrics = null;
    unsubscribeMutations?.();
    unsubscribeMutations = null;

    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
}

function handleCompletions(runtimes: ClaimRuntime[]): void {
    void (async () => {
        for (const runtime of runtimes) {
            try {
                await completeClaim(runtime);
            } catch (err) {
                Logger.warn(`Could not complete quest claim ${runtime.claimId}: ${err}`, CTX);
            }
        }
    })();
}

/**
 * Writes buffered progress out on the way down.
 *
 * **SIGTERM is the one that works**, and it is the one that matters: it is what a container
 * runtime, systemd and a deploy send. Nothing else in the bot listens for it, so this handler gets
 * a live database connection and a clean flush.
 *
 * **SIGINT — Ctrl-C in development — is best-effort.** `libs/database/src/connection.ts` registered
 * its own SIGINT handler at import time, long before this one, and that handler closes the
 * connection and calls `process.exit(0)`. Node starts every listener in registration order, so this
 * flush begins, but it is racing an imminent exit and will usually lose. Up to one flush interval
 * of progress is dropped; reconcile rebuilds most of it from durable totals on the next tick, which
 * is why that mechanism exists.
 */
function bindShutdownFlush(): void {
    if (shutdownBound) return;
    shutdownBound = true;

    const flush = () => {
        void flushProgress().catch(() => null);
    };

    process.once("SIGTERM", flush);
    process.once("SIGINT", flush);
}
