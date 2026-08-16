import type { Types } from "mongoose";
import {
    QuestGenerationHistory,
    type IQuestGenerationHistory,
    type QuestGenerationStatus,
} from "@database/models/QuestGenerationHistory";
import type { QuestTier } from "@constants";

export interface PlanInput {
    guildId: string;
    tier: QuestTier;
    windowKey: string;
    scheduledAt: Date;
    status: QuestGenerationStatus;
    reason?: string;
    plannedCount?: number;
    chosenWindowKeys?: string[];
}

export class QuestGenerationRepository {
    /**
     * Records the intent to generate. False means the occasion was already planned.
     *
     * Insert-first, catch E11000 — the same idempotency trick the API request log uses. Because the
     * scheduled instant is derived from a seed rather than rolled freshly, a racing planner
     * computes an identical row, so losing the race costs nothing.
     */
    static async plan(input: PlanInput): Promise<boolean> {
        try {
            await QuestGenerationHistory.create({
                guildId: input.guildId,
                tier: input.tier,
                windowKey: input.windowKey,
                scheduledAt: input.scheduledAt,
                status: input.status,
                reason: input.reason ?? "",
                plannedCount: input.plannedCount ?? null,
                chosenWindowKeys: input.chosenWindowKeys ?? [],
            });
            return true;
        } catch (err) {
            if ((err as { code?: number }).code === 11000) return false;
            throw err;
        }
    }

    static async findPlan(guildId: string, tier: QuestTier, windowKey: string): Promise<IQuestGenerationHistory | null> {
        return QuestGenerationHistory.findOne({ guildId, tier, windowKey });
    }

    /**
     * Leases the next due row. Null when nothing is due.
     *
     * Filtering on `status: "scheduled"` inside the update makes this an atomic take, so several
     * rows coming due during a long stall are drained one at a time in scheduled order rather than
     * all being fired by every caller.
     */
    static async leaseNextDue(now = new Date()): Promise<IQuestGenerationHistory | null> {
        return QuestGenerationHistory.findOneAndUpdate(
            { status: "scheduled", scheduledAt: { $lte: now } },
            { $set: { status: "firing", firingAt: now }, $inc: { attempts: 1 } },
            { sort: { scheduledAt: 1 }, returnDocument: "after" }
        );
    }

    /** Returns rows abandoned mid-fire by a crash to the queue. */
    static async reclaimStale(olderThan: Date): Promise<number> {
        const result = await QuestGenerationHistory.updateMany(
            { status: "firing", firingAt: { $lt: olderThan } },
            { $set: { status: "scheduled" } }
        );
        return result.modifiedCount ?? 0;
    }

    static async markGenerated(id: Types.ObjectId, questId: Types.ObjectId): Promise<void> {
        await QuestGenerationHistory.updateOne(
            { _id: id },
            { $set: { status: "generated", questId, generatedAt: new Date() } }
        );
    }

    static async markResolved(id: Types.ObjectId, status: QuestGenerationStatus, reason: string): Promise<void> {
        await QuestGenerationHistory.updateOne({ _id: id }, { $set: { status, reason } });
    }

    /** Puts a transiently failed row back in the queue for the next tick. */
    static async requeue(id: Types.ObjectId, reason: string): Promise<void> {
        await QuestGenerationHistory.updateOne({ _id: id }, { $set: { status: "scheduled", reason, firingAt: null } });
    }

    static async recentForGuild(guildId: string, limit = 20): Promise<IQuestGenerationHistory[]> {
        return QuestGenerationHistory.find({ guildId }).sort({ scheduledAt: -1 }).limit(limit);
    }
}
