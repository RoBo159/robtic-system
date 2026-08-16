import { Schema, model, type Document, type Types } from "mongoose";
import { QUEST_TIERS, QUEST_SLOTS, type QuestTier, type QuestSlot } from "@constants";

/**
 * `completing` is a crash-safe intermediate, not a state anyone sees.
 *
 * Completion is a compare-and-swap out of `active`, so exactly one worker can ever transition a
 * claim; the reward is paid while it sits in `completing`, and the tick resumes anything left there
 * by a crash. Without it, two detections could pay the same member twice.
 */
export const QUEST_CLAIM_STATUSES = ["active", "completing", "completed", "expired"] as const;
export type QuestClaimStatus = typeof QUEST_CLAIM_STATUSES[number];

export const QUEST_OUTCOMES = ["pending", "completed", "failed"] as const;
export type QuestOutcome = typeof QUEST_OUTCOMES[number];

/** One member's attempt at one quest. Never deleted — this row is the statistics record. */
export interface IQuestClaim extends Document {
    _id: Types.ObjectId;
    guildId: string;
    questId: Types.ObjectId;
    discordId: string;
    username: string;
    tier: QuestTier;
    /** Which of the member's three concurrent slots this occupies. */
    slot: QuestSlot;
    /**
     * Which copy of that slot, 0-based.
     *
     * Everyone has copy 0. Premium's `EXTRA_QUEST_SLOT` grants 1, 2, …, so "one live claim per
     * slot" becomes "one live claim per slot *copy*" — an extra slot is a row with a higher index
     * rather than a special case threaded through the claim path.
     */
    slotIndex: number;
    status: QuestClaimStatus;
    outcome: QuestOutcome;
    /** missionId → progress. Written by `$inc` for sum missions, `$max` for level missions. */
    progress: Record<string, number>;
    /** The quest's missions, copied so a retuned template cannot move the goalposts mid-attempt. */
    missions: IQuestClaimMission[];
    /**
     * Durable counter values at claim time.
     *
     * Progress for metrics that already have a persistent total is *derived* as
     * `current - baseline` rather than accumulated, so a crash that loses buffered deltas
     * self-heals on the next reconcile.
     */
    baseline: Record<string, number>;
    claimedAt: Date;
    /** Always the quest's `endsAt` — everyone on a quest finishes together. */
    expiresAt: Date;
    /** Set when the last threshold was crossed, from the metric event rather than the flush. */
    crossedAt: Date | null;
    completedAt: Date | null;
    resolvedAt: Date | null;
    /** Order of completion among claimers, 1-based. Null until completed. */
    completionRank: number | null;
    rewardPaid: number;
    missionsCompleted: number;
    missionsTotal: number;
    lastProgressAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IQuestClaimMission {
    missionId: string;
    templateKey: string;
    metric: string;
    accumulation: "sum" | "max";
    target: number;
    label: string;
}

const claimMissionSchema = new Schema<IQuestClaimMission>(
    {
        missionId: { type: String, required: true },
        templateKey: { type: String, required: true },
        metric: { type: String, required: true },
        accumulation: { type: String, required: true, enum: ["sum", "max"] },
        target: { type: Number, required: true },
        label: { type: String, required: true },
    },
    { _id: false }
);

const questClaimSchema = new Schema<IQuestClaim>(
    {
        guildId: { type: String, required: true, index: true },
        questId: { type: Schema.Types.ObjectId, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, default: "" },
        tier: { type: String, required: true, enum: QUEST_TIERS },
        slot: { type: String, required: true, enum: QUEST_SLOTS },
        slotIndex: { type: Number, required: true, default: 0 },
        status: { type: String, required: true, enum: QUEST_CLAIM_STATUSES, default: "active" },
        outcome: { type: String, required: true, enum: QUEST_OUTCOMES, default: "pending" },
        progress: { type: Schema.Types.Mixed, default: () => ({}) },
        missions: { type: [claimMissionSchema], default: [] },
        baseline: { type: Schema.Types.Mixed, default: () => ({}) },
        claimedAt: { type: Date, default: () => new Date() },
        expiresAt: { type: Date, required: true },
        crossedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        resolvedAt: { type: Date, default: null },
        completionRank: { type: Number, default: null },
        rewardPaid: { type: Number, default: 0 },
        missionsCompleted: { type: Number, default: 0 },
        missionsTotal: { type: Number, default: 0 },
        lastProgressAt: { type: Date, default: null },
    },
    { timestamps: true }
);

/**
 * One live claim per slot copy, enforced by the database rather than by a read.
 *
 * Partial on `status: "active"` so resolved claims never collide — a member can churn through any
 * number of quests, but can never hold two in the same copy. Two simultaneous claim presses resolve
 * here: one insert wins, the other gets E11000 and gives its reserved slot back.
 *
 * `slotIndex` is part of the key so a premium member with an extra slot inserts at index 1 rather
 * than colliding. The rule is unchanged; it is simply counted per copy.
 */
questClaimSchema.index(
    { guildId: 1, discordId: 1, slot: 1, slotIndex: 1 },
    { unique: true, partialFilterExpression: { status: "active" } }
);
questClaimSchema.index({ guildId: 1, questId: 1, discordId: 1 }, { unique: true });
// The expiry sweep. status first: the active set is tiny next to accumulated history.
questClaimSchema.index({ status: 1, expiresAt: 1 });
// Statistics: completion rates per tier over a period.
questClaimSchema.index({ guildId: 1, tier: 1, outcome: 1, resolvedAt: -1 });
questClaimSchema.index({ guildId: 1, discordId: 1, resolvedAt: -1 });

export const QuestClaim = model<IQuestClaim>("QuestClaim", questClaimSchema);
