import type { Types } from "mongoose";
import { QuestClaim, type IQuestClaim, type IQuestClaimMission } from "@database/models/QuestClaim";
import type { QuestSlot, QuestTier } from "@constants";

export interface CreateClaimInput {
    guildId: string;
    questId: Types.ObjectId;
    discordId: string;
    username: string;
    tier: QuestTier;
    slot: QuestSlot;
    missions: IQuestClaimMission[];
    baseline: Record<string, number>;
    expiresAt: Date;
}

/** Signalled whenever a member's set of live claims changes, so the in-memory cache can drop them. */
type MutationListener = (guildId: string, discordId: string) => void;
const mutationListeners = new Set<MutationListener>();

export class QuestClaimRepository {
    /**
     * Registers a cache invalidator.
     *
     * The claim cache lives in `libs/core` and cannot be imported from here without inverting the
     * layering, so the consumer hands us a callback at startup instead. Same intent as the private
     * `update()` in the cached settings repositories: no write path can forget to invalidate.
     */
    static onMutation(listener: MutationListener): () => void {
        mutationListeners.add(listener);
        return () => mutationListeners.delete(listener);
    }

    private static announce(guildId: string, discordId: string): void {
        for (const listener of mutationListeners) listener(guildId, discordId);
    }

    /**
     * Inserts the claim. Throws E11000 when the member already holds this slot or this quest.
     *
     * The caller must treat that as "give the reserved slot back" — the unique indexes are the
     * authority on one-claim-per-slot, not a preceding read.
     */
    static async create(input: CreateClaimInput): Promise<IQuestClaim> {
        const claim = await QuestClaim.create({
            ...input,
            missionsTotal: input.missions.length,
        }) as unknown as IQuestClaim;

        this.announce(input.guildId, input.discordId);
        return claim;
    }

    static async findActiveForMember(guildId: string, discordId: string, now = new Date()): Promise<IQuestClaim[]> {
        return QuestClaim.find({ guildId, discordId, status: "active", expiresAt: { $gt: now } }).lean<IQuestClaim[]>();
    }

    static async findById(claimId: Types.ObjectId | string): Promise<IQuestClaim | null> {
        return QuestClaim.findById(claimId);
    }

    static async findRecentForMember(guildId: string, discordId: string, limit = 10): Promise<IQuestClaim[]> {
        return QuestClaim.find({ guildId, discordId }).sort({ createdAt: -1 }).limit(limit);
    }

    /**
     * Compare-and-swaps a finished claim out of `active`.
     *
     * The filter re-verifies every mission threshold against the database rather than trusting the
     * in-memory shadow, so an optimistic buffer, an admin reset or a stale cache simply fails to
     * match. Exactly one caller can ever win, which is what makes the reward safe to pay next.
     */
    static async leaseCompletion(
        claimId: Types.ObjectId | string,
        thresholds: Record<string, number>,
        crossedAt: Date,
        now = new Date(),
    ): Promise<IQuestClaim | null> {
        const filter: Record<string, unknown> = {
            _id: claimId,
            status: "active",
            expiresAt: { $gt: now },
        };

        for (const [missionId, target] of Object.entries(thresholds)) {
            filter[`progress.${missionId}`] = { $gte: target };
        }

        return QuestClaim.findOneAndUpdate(
            filter,
            { $set: { status: "completing", completedAt: now, crossedAt } },
            { returnDocument: "after" }
        );
    }

    /** Seals a completion after the reward has landed. */
    static async finishCompletion(
        claim: IQuestClaim,
        completionRank: number,
        rewardPaid: number,
    ): Promise<void> {
        await QuestClaim.updateOne(
            { _id: claim._id, status: "completing" },
            {
                $set: {
                    status: "completed",
                    outcome: "completed",
                    completionRank,
                    rewardPaid,
                    resolvedAt: new Date(),
                    missionsCompleted: claim.missionsTotal,
                },
            }
        );

        this.announce(claim.guildId, claim.discordId);
    }

    /** Claims stuck mid-completion by a crash, ready to resume at rank allocation. */
    static async findStuckCompleting(olderThan: Date, limit = 100): Promise<IQuestClaim[]> {
        return QuestClaim.find({ status: "completing", completedAt: { $lt: olderThan } }).limit(limit);
    }

    static async findDueToExpire(now = new Date(), limit = 500): Promise<IQuestClaim[]> {
        return QuestClaim.find({ status: "active", expiresAt: { $lte: now } }).limit(limit);
    }

    /** Fails a claim that ran out of time. Guarded on `active` so it can never race a completion. */
    static async expire(claim: IQuestClaim, missionsCompleted: number, now = new Date()): Promise<boolean> {
        const result = await QuestClaim.updateOne(
            { _id: claim._id, status: "active" },
            {
                $set: {
                    status: "expired",
                    outcome: "failed",
                    resolvedAt: now,
                    missionsCompleted,
                },
            }
        );

        if (result.modifiedCount > 0) {
            this.announce(claim.guildId, claim.discordId);
            return true;
        }
        return false;
    }

    static async countByOutcome(guildId: string, discordId: string, outcome: "completed" | "failed"): Promise<number> {
        return QuestClaim.countDocuments({ guildId, discordId, outcome });
    }
}
