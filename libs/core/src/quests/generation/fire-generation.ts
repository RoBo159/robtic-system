import { QuestGenerationRepository, QuestRepository, QuestSettingsRepository } from "@database/repositories";
import type { IQuest, IQuestGenerationHistory } from "@database/models";
import { tierEnabled } from "@database/models";
import { QUEST_TIER_SPECS, QUEST_CONFIG } from "@constants";
import { isFeatureEnabled } from "@core/features";
import { Logger } from "@logger";
import { buildQuest } from "./build-quest";

const CTX = "quests";
const HOUR_MS = 60 * 60 * 1000;

/** Called with each freshly generated quest so the caller can post it. */
export type QuestPoster = (quest: IQuest) => Promise<void>;

/**
 * Generates every quest that has come due.
 *
 * Leasing each row (`scheduled` → `firing`) makes this safe to run concurrently and drains several
 * occasions at once, which is what happens when a tick was delayed or the process was down: three
 * windows that came due during the gap all fire here, oldest first, each still subject to its
 * tier's grace.
 */
export async function fireDueGenerations(post: QuestPoster, now = new Date()): Promise<number> {
    await QuestGenerationRepository.reclaimStale(new Date(now.getTime() - QUEST_CONFIG.staleFiringMs));

    let generated = 0;

    for (;;) {
        const due = await QuestGenerationRepository.leaseNextDue(now);
        if (!due) break;

        try {
            if (await fireOne(due, post, now)) generated++;
        } catch (err) {
            Logger.warn(`Quest generation failed for ${due.guildId}/${due.tier}: ${err}`, CTX);
            await requeueOrFail(due, String(err));
        }
    }

    return generated;
}

async function fireOne(row: IQuestGenerationHistory, post: QuestPoster, now: Date): Promise<boolean> {
    const spec = QUEST_TIER_SPECS[row.tier];

    if (!(await isFeatureEnabled(row.guildId, "quests"))) {
        await QuestGenerationRepository.markResolved(row._id as never, "skipped", "feature-disabled");
        return false;
    }

    const settings = await QuestSettingsRepository.getCached(row.guildId);
    if (!tierEnabled(settings, row.tier)) {
        await QuestGenerationRepository.markResolved(row._id as never, "skipped", "tier-disabled");
        return false;
    }

    // Late beyond the tier's tolerance. Daily tiers allow none — a "morning" quest appearing at
    // midnight is worse than one that simply did not appear.
    if (row.scheduledAt.getTime() + spec.graceHours * HOUR_MS < now.getTime()) {
        await QuestGenerationRepository.markResolved(row._id as never, "missed", "past-grace");
        return false;
    }

    // Golden runs for a week and appears about weekly, so its own lifetime overlaps its cadence by
    // construction. Skipping rather than stacking keeps "extremely rare" true, at the cost of the
    // effective interval being slightly over seven days.
    if (spec.exclusive && await QuestRepository.hasOpenOfTier(row.guildId, row.tier)) {
        await QuestGenerationRepository.markResolved(row._id as never, "skipped", "tier-already-open");
        return false;
    }

    const quest = await buildQuest(row.guildId, row.tier, row.windowKey, now);
    if (!quest) {
        await QuestGenerationRepository.markResolved(row._id as never, "skipped", "no-missions-or-duplicate");
        return false;
    }

    // Posting is best-effort: the quest exists and is claimable through /quest even if the announce
    // fails, so a Discord hiccup must not roll back a generated quest.
    try {
        await post(quest);
    } catch (err) {
        Logger.warn(`Generated ${row.tier} quest for ${row.guildId} but could not post it: ${err}`, CTX);
    }

    await QuestGenerationRepository.markGenerated(row._id as never, quest._id);
    Logger.info(`Generated a ${row.tier} quest for ${row.guildId} (${row.windowKey})`, CTX);
    return true;
}

/** Transient failures go back in the queue; persistent ones stop consuming ticks. */
async function requeueOrFail(row: IQuestGenerationHistory, reason: string): Promise<void> {
    if (row.attempts >= QUEST_CONFIG.maxGenerationAttempts) {
        await QuestGenerationRepository.markResolved(row._id as never, "failed", reason.slice(0, 200));
        return;
    }
    await QuestGenerationRepository.requeue(row._id as never, reason.slice(0, 200));
}
