import { QuestRepository, QuestClaimRepository, QuestStatsRepository } from "@database/repositories";
import type { IQuest } from "@database/models";
import { TIER_SLOT, type QuestTier } from "@constants";
import { Logger } from "@logger";
import type { QuestMetric } from "@core/metrics";
import { toRuntime } from "../progress/runtime";
import { primeClaim } from "../progress/claim-cache";
import { snapshotBaseline } from "./snapshot-baseline";

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

        const claim = await QuestClaimRepository.create({
            guildId: reserved.guildId,
            questId: reserved._id,
            discordId,
            username,
            tier: reserved.tier,
            slot: TIER_SLOT[reserved.tier as QuestTier],
            missions: reserved.missions,
            baseline,
            // Everyone on a quest finishes together: a claim ends when the quest does.
            expiresAt: reserved.endsAt,
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
