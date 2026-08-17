import { QuestRepository, QuestClaimRepository, QuestStatsRepository } from "@database/repositories";
import type { IQuest } from "@database/models";
import { TIER_SLOT, QUEST_TIER_SPECS, type QuestTier, type QuestSlot } from "@constants";
import { Logger } from "@logger";
import type { QuestMetric } from "@core/metrics";
import { toRuntime } from "../progress/runtime";
import { primeClaim } from "../progress/claim-cache";
import { snapshotBaseline } from "./snapshot-baseline";
import { getFeatureValue, getDurationMs, PremiumFeature } from "@core/premium";

const CTX = "quests";

export type ClaimFailure =
    | "not-found"
    | "ended"
    | "full"
    | "already-holding"
    | "not-vip"
    | "error";

export interface ClaimResult {
    ok: boolean;
    reason?: ClaimFailure;
    /** On success. */
    claimId?: string;
    expiresAt?: Date;
    /** On "full", how many slots the quest offered. */
    slotsTotal?: number | null;
}

/**
 * The lowest slot copy this member has free.
 *
 * Advisory, not authoritative: the unique index is still what decides, and a losing race comes back
 * as E11000 exactly as it always did. This only picks a sensible index to *try*, so a member with
 * an extra slot fills copy 0 before copy 1 rather than leaving gaps.
 *
 * `uncapped` is how a Special escapes the rule: it scans until it finds a free copy instead of
 * stopping at the member's capacity, so holding one never blocks holding another.
 */
async function firstFreeSlotIndex(
    guildId: string,
    discordId: string,
    slot: QuestSlot,
    extraSlots: number,
    uncapped: boolean,
): Promise<number> {
    const capacity = uncapped ? Number.POSITIVE_INFINITY : 1 + Math.max(0, Math.floor(extraSlots));
    if (capacity === 1) return 0;

    const active = await QuestClaimRepository.findActiveForMember(guildId, discordId);
    const taken = new Set(active.filter(claim => claim.slot === slot).map(claim => claim.slotIndex ?? 0));

    for (let index = 0; index < capacity; index++) {
        if (!taken.has(index)) return index;
    }

    // Full. Index 0 is the honest attempt: it collides, and the caller reports "already holding".
    return 0;
}

/**
 * Takes a slot on a quest for one member.
 *
 * Reserve first, insert second, compensate on failure — never the other way round. Reserving is a
 * single-document `$inc` guarded by `slotsRemaining > 0`, which MongoDB serialises, so overclaiming
 * is impossible without a transaction. The insert then meets the partial unique index that enforces
 * one live claim per slot; E11000 there means the member already holds one and the reserved slot
 * goes straight back.
 *
 * A crash between the two orphans a single slot. That is the one unavoidable cost of having no
 * transactions, and the expiry tick's slot reconciliation repairs it.
 */
export async function claimQuest(
    quest: IQuest,
    discordId: string,
    username: string,
): Promise<ClaimResult> {
    const reserved = await QuestRepository.reserveSlot(quest._id);

    if (!reserved) {
        // Read once more to say *why* — the member deserves better than "no".
        const fresh = await QuestRepository.findById(quest._id);
        if (!fresh) return { ok: false, reason: "not-found" };
        if (fresh.status !== "open" || fresh.endsAt.getTime() <= Date.now()) {
            return { ok: false, reason: "ended" };
        }
        return { ok: false, reason: "full", slotsTotal: fresh.slotsTotal };
    }

    try {
        const metrics = reserved.missions.map(mission => mission.metric as QuestMetric);
        const baseline = await snapshotBaseline(reserved.guildId, discordId, username, metrics);

        // Both perks come from the engine rather than from a role check, so a tier that grants
        // neither leaves this path arithmetically identical to what it was before premium existed.
        const [extraSlots, extensionMs] = await Promise.all([
            getFeatureValue(reserved.guildId, discordId, PremiumFeature.EXTRA_QUEST_SLOT),
            getDurationMs(reserved.guildId, discordId, PremiumFeature.QUEST_TIME_EXTENSION),
        ]);

        const claim = await QuestClaimRepository.create({
            guildId: reserved.guildId,
            questId: reserved._id,
            discordId,
            username,
            tier: reserved.tier,
            slot: TIER_SLOT[reserved.tier as QuestTier],
            // The first free copy of the slot. Everyone has copy 0; an extra slot is copy 1.
            // A tier that ignores the slot limit takes the next free copy of its own slot, however
            // many that is — which is what lets a Special be claimed alongside anything else.
            slotIndex: await firstFreeSlotIndex(
                reserved.guildId,
                discordId,
                TIER_SLOT[reserved.tier as QuestTier],
                extraSlots,
                QUEST_TIER_SPECS[reserved.tier as QuestTier].ignoresSlotLimit === true,
            ),
            missions: reserved.missions,
            baseline,
            // Everyone on a quest finishes together — except a member whose tier bought them more
            // time, who keeps working after the quest itself has closed to new claims.
            expiresAt: new Date(reserved.endsAt.getTime() + extensionMs),
        });

        // The caller already has the document, so seed the cache rather than forcing a re-read on
        // this member's very next message.
        primeClaim(toRuntime(claim));

        await QuestStatsRepository.recordClaim(reserved.guildId, discordId, username).catch(err =>
            Logger.warn(`Could not record quest claim stat for ${discordId}: ${err}`, CTX)
        );

        return { ok: true, claimId: String(claim._id), expiresAt: claim.expiresAt };
    } catch (err) {
        await QuestRepository.releaseSlot(quest._id).catch(() => null);

        if ((err as { code?: number }).code === 11000) {
            return { ok: false, reason: "already-holding" };
        }

        Logger.error(`Failed to claim quest ${quest._id} for ${discordId}: ${err}`, CTX);
        return { ok: false, reason: "error" };
    }
}
