import { QuestRepository } from "@database/repositories";
import type { IQuest } from "@database/models";
import {
    QUEST_TIER_SPECS,
    QUEST_UNLIMITED_SLOTS,
    rollQuestRange,
    type QuestTier,
} from "@constants";
import { rollMissions } from "../missions/roll-missions";
import { randomInt } from "./random";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Rolls and stores one quest.
 *
 * Everything variable — the missions and the lifetime — is rolled freshly and written onto the
 * document as it is created. The document *is* the record: nothing ever needs to reproduce the
 * roll, and two quests of the same tier on the same day differ from each other.
 *
 * The unique `(guildId, tier, cycleKey)` index keeps a retry safe. A duplicate key means another
 * worker already created the quest for this occasion, so this one steps aside rather than adding
 * a second.
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

    const missions = rollMissions(tier, rollQuestRange(spec.missions));
    if (missions.length === 0) return null;

    // Rolled when the tier declares a range, taken as-is when it declares a number. Either way both
    // are copied onto the document, so retuning the table later cannot change a quest already
    // posted — and two Specials posted an hour apart genuinely differ.
    const reward = rollQuestRange(spec.reward);
    const slotsTotal = spec.slots === null ? null : rollQuestRange(spec.slots);
    const durationHours = randomInt(spec.durationHours.min, spec.durationHours.max);

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
