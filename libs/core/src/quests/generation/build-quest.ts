import { QuestRepository } from "@database/repositories";
import type { IQuest } from "@database/models";
import {
    QUEST_TIER_SPECS,
    QUEST_UNLIMITED_SLOTS,
    type QuestTier,
} from "@constants";
import { rollMissions } from "../missions/roll-missions";
import { occasionRandom, randomInt } from "./seeded-random";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Rolls and stores one quest.
 *
 * Everything variable — the missions and the lifetime — comes from the same seeded stream as the
 * scheduled instant, so a retry after a partial failure produces an identical quest rather than a
 * second, different one. The unique `(guildId, tier, cycleKey)` index makes that retry safe.
 *
 * Reward and claim slots are not rolled at all: they are whatever `QUEST_TIER_SPECS` says for the
 * tier, which is the one table to edit when those numbers should change.
 *
 * Missions are frozen onto the document. A quest that is already live keeps meaning what it meant
 * when members claimed it, even if the template is retuned or deleted tomorrow.
 */
export async function buildQuest(
    guildId: string,
    tier: QuestTier,
    cycleKey: string,
    now = new Date(),
): Promise<IQuest | null> {
    const spec = QUEST_TIER_SPECS[tier];
    const random = occasionRandom(guildId, tier, `${cycleKey}#quest`);

    const missions = rollMissions(tier, spec.missions, random);
    if (missions.length === 0) return null;

    // Reward and slots are fixed per tier; only the missions and the lifetime vary. Both are still
    // copied onto the document, so retuning the table later cannot change a quest already posted.
    const reward = spec.reward;
    const slotsTotal = spec.slots;
    const durationHours = randomInt(random, spec.durationHours.min, spec.durationHours.max);

    try {
        return await QuestRepository.create({
            guildId,
            tier,
            cycleKey,
            status: "open",
            missions,
            reward,
            // Unlimited tiers get a sentinel rather than a special case, so the reservation stays
            // one indexed predicate: `slotsRemaining > 0`.
            slotsRemaining: slotsTotal ?? QUEST_UNLIMITED_SLOTS,
            slotsTaken: 0,
            slotsTotal,
            endsAt: new Date(now.getTime() + durationHours * HOUR_MS),
        });
    } catch (err) {
        // Another worker won the same cycle key; theirs is the quest.
        if ((err as { code?: number }).code === 11000) return null;
        throw err;
    }
}
