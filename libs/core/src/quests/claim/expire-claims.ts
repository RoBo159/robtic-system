import { QuestClaimRepository, QuestStatsRepository } from "@database/repositories";
import type { IQuestClaim } from "@database/models";
import { QUEST_CONFIG } from "@constants";
import { Logger } from "@logger";
import { flushProgress } from "../progress/buffer";
import { invalidateMemberClaims } from "../progress/claim-cache";
import { thresholdsOf, toRuntime } from "../progress/runtime";
import { reconcileClaim } from "./reconcile-claim";
import { finishLeasedClaim } from "./complete-claim";

const CTX = "quests";

export interface ExpirySummary {
    expired: number;
    rescued: number;
    resumed: number;
}

/**
 * Resolves everything whose time is up.
 *
 * The order per claim is load-bearing:
 *
 *  1. **Flush** the buffer first — the last few seconds of progress are exactly the ones most
 *     likely to have finished the quest, and discarding them fails somebody who made it.
 *  2. **Reconcile** from durable totals, in case a crash lost buffered deltas.
 *  3. **Try the completion lease** — someone who crossed the line 200ms before the deadline is
 *     completed, not failed.
 *  4. Only then mark it failed.
 *
 * Both skipped steps produce silent, unfixable unfairness, which is why they are spelled out here
 * rather than left to the reader.
 */
export async function expireDueClaims(now = new Date()): Promise<ExpirySummary> {
    const summary: ExpirySummary = { expired: 0, rescued: 0, resumed: 0 };

    summary.resumed = await resumeStuckCompletions(now);

    // One flush for the whole batch rather than per claim.
    await flushProgress();

    for (;;) {
        const due = await QuestClaimRepository.findDueToExpire(now, QUEST_CONFIG.expiryBatchSize);
        if (due.length === 0) break;

        for (const claim of due) {
            try {
                const rescued = await resolveOne(claim, now);
                if (rescued) summary.rescued++;
                else summary.expired++;
            } catch (err) {
                Logger.warn(`Failed to resolve quest claim ${String(claim._id)}: ${err}`, CTX);
            }
        }

        if (due.length < QUEST_CONFIG.expiryBatchSize) break;
    }

    return summary;
}

/** True when the claim was actually finished in time and got paid instead of failed. */
async function resolveOne(claim: IQuestClaim, now: Date): Promise<boolean> {
    await reconcileClaim(claim);

    const refreshed = await QuestClaimRepository.findById(claim._id);
    if (!refreshed || refreshed.status !== "active") return false;

    const runtime = toRuntime(refreshed);

    // A last chance: the deadline has passed, but the lease allows it because the row still says
    // active and every threshold is met. `expiresAt: { $gt: now }` inside leaseCompletion would
    // refuse, so the check is done here with the claim's own thresholds.
    const allMet = runtime.missions.every(mission => mission.persisted >= mission.target);

    if (allMet) {
        const leased = await QuestClaimRepository.leaseCompletion(
            refreshed._id,
            thresholdsOf(runtime),
            now,
            // Deadline already passed; the lease's own freshness check would reject it otherwise.
            new Date(refreshed.expiresAt.getTime() - 1),
        );

        if (leased) {
            await finishLeasedClaim(leased);
            return true;
        }
    }

    const completedMissions = runtime.missions.filter(mission => mission.persisted >= mission.target).length;
    const expired = await QuestClaimRepository.expire(refreshed, completedMissions, now);

    if (expired) {
        await QuestStatsRepository.recordFailure(refreshed.guildId, refreshed.discordId).catch(() => null);
        invalidateMemberClaims(refreshed.guildId, refreshed.discordId);
    }

    return false;
}

/**
 * Picks up completions a crash left mid-flight.
 *
 * A claim sitting in `completing` has already been leased, so the rank and payment steps simply
 * resume — the idempotency key means re-running them is safe.
 */
async function resumeStuckCompletions(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - QUEST_CONFIG.staleCompletingMs);
    const stuck = await QuestClaimRepository.findStuckCompleting(cutoff);

    let resumed = 0;
    for (const claim of stuck) {
        try {
            const result = await finishLeasedClaim(claim);
            if (result.completed) resumed++;
        } catch (err) {
            Logger.warn(`Could not resume completion for ${String(claim._id)}: ${err}`, CTX);
        }
    }

    return resumed;
}
