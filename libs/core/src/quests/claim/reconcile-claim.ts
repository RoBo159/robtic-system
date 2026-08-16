import { QuestClaim } from "@database/models";
import type { IQuestClaim } from "@database/models";
import { Logger } from "@logger";
import type { QuestMetric } from "@core/metrics";
import { currentTotals, isReconcilable } from "./snapshot-baseline";

const CTX = "quests";

/**
 * Rebuilds progress from durable totals, for the metrics that have one.
 *
 * The buffer is the fast path; this is the truth. `progress = current - baseline` cannot lose a
 * delta to a crash, because it never depended on the delta being observed — so a hard kill
 * self-heals for messages, xp, voice time, voice XP and points earned. Combo, level-ups and
 * community contribution have no per-member running total and are left as accumulated.
 *
 * Only ever raises a value. A metric that legitimately went down — points spent, a broken streak —
 * must not claw back quest progress the member already earned.
 */
export async function reconcileClaim(claim: IQuestClaim): Promise<boolean> {
    const metrics = claim.missions
        .map(mission => mission.metric as QuestMetric)
        .filter(isReconcilable);

    if (metrics.length === 0) return false;

    let totals: Record<string, number>;
    try {
        totals = await currentTotals(claim.guildId, claim.discordId, claim.username, metrics);
    } catch (err) {
        Logger.warn(`Could not reconcile claim ${String(claim._id)}: ${err}`, CTX);
        return false;
    }

    const maxes: Record<string, number> = {};

    for (const mission of claim.missions) {
        const metric = mission.metric as QuestMetric;
        if (!isReconcilable(metric)) continue;

        const current = totals[metric];
        if (current === undefined) continue;

        const derived = mission.accumulation === "max"
            ? current                                        // a level: the value reached is the progress
            : Math.max(0, current - (claim.baseline?.[metric] ?? 0));

        const stored = claim.progress?.[mission.missionId] ?? 0;
        if (derived > stored) maxes[`progress.${mission.missionId}`] = derived;
    }

    if (Object.keys(maxes).length === 0) return false;

    // `$max` rather than `$set`: a concurrent flush may have written something higher between the
    // read and this write, and reconciliation must never move progress backwards.
    await QuestClaim.updateOne({ _id: claim._id, status: "active" }, { $max: maxes });
    return true;
}
