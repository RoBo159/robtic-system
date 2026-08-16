import { QuestClaim } from "@database/models";
import { QUEST_CONFIG } from "@constants";
import { Logger } from "@logger";
import type { MetricEvent } from "@core/metrics";
import { peekClaims, fillClaims } from "./claim-cache";
import { effectiveValue, type ClaimRuntime, type MissionRuntime } from "./runtime";

const CTX = "quests";

/** Claims with unflushed progress. */
const dirty = new Map<string, ClaimRuntime>();

/**
 * Claims whose every mission is met, awaiting the authoritative check.
 *
 * Holds the runtime rather than just the id: `dirty` is cleared before the write, so looking the
 * runtime up there afterwards would always come back empty.
 */
const completionCandidates = new Map<string, ClaimRuntime>();

let priorityScheduled = false;
let onCompletionReady: ((runtimes: ClaimRuntime[]) => void) | null = null;

/** Set once at startup. Called after a flush with the claims that look finished. */
export function setCompletionHandler(handler: (runtimes: ClaimRuntime[]) => void): void {
    onCompletionReady = handler;
}

/**
 * Applies one metric event to whatever the member is working on.
 *
 * Synchronous and allocation-light: a member with no quest costs one Map miss, and a member whose
 * missions ignore this metric costs two. Nothing here touches the database — completion is noticed
 * in memory and confirmed later against the real row.
 */
export function recordMetric(event: MetricEvent): void {
    const claims = peekClaims(event.guildId, event.discordId);

    if (claims === undefined) {
        // Never seen this member. Load them, and replay this event once they are known so the
        // message that prompted the load is not the one message that fails to count.
        fillClaims(event.guildId, event.discordId, loaded => {
            for (const runtime of loaded) apply(runtime, event);
        });
        return;
    }

    if (claims === null) return;

    for (const runtime of claims) apply(runtime, event);
}

function apply(runtime: ClaimRuntime, event: MetricEvent): void {
    const missions = runtime.byMetric.get(event.metric);
    if (!missions) return;

    let touched = false;

    for (const mission of missions) {
        if (mission.done) continue;

        if (mission.accumulation === "sum") {
            mission.pending += event.value;
        } else {
            // A level: the producer publishes the value reached, so keep the high-water mark.
            if (event.value <= effectiveValue(mission)) continue;
            mission.pending = event.value;
        }

        touched = true;

        if (effectiveValue(mission) >= mission.target) {
            mission.done = true;
            runtime.remaining--;
        }
    }

    if (!touched) return;

    dirty.set(runtime.claimId, runtime);

    if (runtime.remaining <= 0) {
        completionCandidates.set(runtime.claimId, runtime);
        schedulePriorityFlush();
    } else if (dirty.size >= QUEST_CONFIG.flushDirtyThreshold) {
        schedulePriorityFlush();
    }
}

/** Coalesced next-tick flush, so a finished quest is paid in milliseconds rather than on the timer. */
function schedulePriorityFlush(): void {
    if (priorityScheduled) return;
    priorityScheduled = true;

    setTimeout(() => {
        priorityScheduled = false;
        void flushProgress();
    }, 0);
}

interface DrainedClaim {
    runtime: ClaimRuntime;
    incs: Record<string, number>;
    maxes: Record<string, number>;
}

/**
 * Writes buffered progress and hands finished claims to the completion handler.
 *
 * Deliberately unlike `activity-tracker.flushActivity`, which clears its dirty set before awaiting
 * and swallows failures. That is correct there because it writes a timestamp with `$set` and the
 * next flush rewrites it. Here the payload is `$inc`, so a dropped batch is progress a member
 * actually earned and will never see again — failed operations are pushed back into the buffer.
 *
 * The residual risk is a write that succeeded server-side but whose response was lost: restoring
 * then double-applies. That is at-least-once, not exactly-once, bounded to one flush interval of
 * one member, and self-correcting for every metric that reconcile can derive from a durable total.
 */
export async function flushProgress(): Promise<number> {
    if (dirty.size === 0) {
        await handleCompletions();
        return 0;
    }

    const drained: DrainedClaim[] = [];

    for (const runtime of dirty.values()) {
        const incs: Record<string, number> = {};
        const maxes: Record<string, number> = {};

        for (const mission of runtime.missions) {
            if (mission.pending === 0) continue;

            if (mission.accumulation === "sum") {
                incs[`progress.${mission.missionId}`] = mission.pending;
                mission.persisted += mission.pending;
            } else {
                maxes[`progress.${mission.missionId}`] = mission.pending;
                mission.persisted = Math.max(mission.persisted, mission.pending);
            }

            mission.pending = 0;
        }

        if (Object.keys(incs).length || Object.keys(maxes).length) {
            drained.push({ runtime, incs, maxes });
        }
    }

    dirty.clear();

    if (drained.length === 0) {
        await handleCompletions();
        return 0;
    }

    const now = new Date();
    const operations = drained.map(({ runtime, incs, maxes }) => ({
        updateOne: {
            // `status: "active"` means progress arriving after a claim resolved is discarded, which
            // is what we want and costs nothing.
            filter: { _id: runtime.claimId, status: "active" as const },
            update: {
                ...(Object.keys(incs).length ? { $inc: incs } : {}),
                ...(Object.keys(maxes).length ? { $max: maxes } : {}),
                $set: { lastProgressAt: now },
            },
        },
    }));

    try {
        await QuestClaim.bulkWrite(operations, { ordered: false });
    } catch (err) {
        restoreFailed(drained, err);
        Logger.warn(`Quest progress flush partially failed: ${err}`, CTX);
    }

    await handleCompletions();
    return drained.length;
}

/** Puts the deltas of failed operations back, so they are retried rather than lost. */
function restoreFailed(drained: DrainedClaim[], err: unknown): void {
    const writeErrors = (err as { writeErrors?: { index: number }[] }).writeErrors;
    // No per-operation detail means the whole batch is suspect; restore all of it.
    const failedIndices = writeErrors?.length
        ? new Set(writeErrors.map(e => e.index))
        : new Set(drained.map((_, index) => index));

    drained.forEach((entry, index) => {
        if (!failedIndices.has(index)) return;

        for (const mission of entry.runtime.missions) {
            const inc = entry.incs[`progress.${mission.missionId}`];
            const max = entry.maxes[`progress.${mission.missionId}`];

            if (inc !== undefined) {
                mission.persisted -= inc;
                mission.pending += inc;
            } else if (max !== undefined) {
                mission.pending = Math.max(mission.pending, max);
            }
        }

        dirty.set(entry.runtime.claimId, entry.runtime);
    });
}

/**
 * Hands finished claims to the completion handler, after their progress is durable.
 *
 * A candidate whose deltas failed to write is put back rather than resolved — the completion lease
 * re-checks thresholds against the database, so submitting one whose progress never landed would
 * simply fail to match and quietly drop the completion.
 */
async function handleCompletions(): Promise<void> {
    if (completionCandidates.size === 0 || !onCompletionReady) return;

    const ready: ClaimRuntime[] = [];

    for (const [claimId, runtime] of completionCandidates) {
        if (dirty.has(claimId)) continue;   // restored by a failed write; try again next flush
        ready.push(runtime);
        completionCandidates.delete(claimId);
    }

    if (ready.length === 0) return;
    onCompletionReady(ready);
}

/** Registers a finished claim for the authoritative check without going through intake. */
export function markCompletionCandidate(runtime: ClaimRuntime): void {
    completionCandidates.set(runtime.claimId, runtime);
    schedulePriorityFlush();
}

/** Buffered but unwritten claims, for diagnostics and shutdown. */
export function pendingClaimCount(): number {
    return dirty.size;
}

export function clearProgressBuffer(): void {
    dirty.clear();
    completionCandidates.clear();
}
