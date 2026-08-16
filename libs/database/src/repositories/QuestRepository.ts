import { Types } from "mongoose";
import { Quest, type IQuest } from "@database/models/Quest";
import { QuestClaim } from "@database/models/QuestClaim";
import type { QuestTier } from "@constants";

export class QuestRepository {
    static async create(input: Partial<IQuest>): Promise<IQuest> {
        return Quest.create(input) as unknown as IQuest;
    }

    static async findById(questId: Types.ObjectId | string): Promise<IQuest | null> {
        return Quest.findById(questId);
    }

    /** Everything a member could still claim in this guild. */
    static async findOpen(guildId: string): Promise<IQuest[]> {
        return Quest.find({ guildId, status: "open", endsAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    }

    static async hasOpenOfTier(guildId: string, tier: QuestTier): Promise<boolean> {
        const existing = await Quest.exists({ guildId, tier, status: { $in: ["open", "closed"] }, endsAt: { $gt: new Date() } });
        return existing !== null;
    }

    /**
     * Takes one slot, atomically.
     *
     * The whole reservation is a single-document update, which MongoDB serialises — so
     * `slotsRemaining` can never go below zero and exactly `slotsTotal` reservations can ever
     * succeed, without a transaction. Returns null when the quest ended, closed, or filled up;
     * the caller reads the quest once more to say which.
     */
    static async reserveSlot(questId: Types.ObjectId | string, now = new Date()): Promise<IQuest | null> {
        return Quest.findOneAndUpdate(
            { _id: questId, status: "open", endsAt: { $gt: now }, slotsRemaining: { $gt: 0 } },
            { $inc: { slotsRemaining: -1, slotsTaken: 1 } },
            { returnDocument: "after" }
        );
    }

    /** Hands a reserved slot back after the claim insert failed. */
    static async releaseSlot(questId: Types.ObjectId | string): Promise<void> {
        await Quest.updateOne({ _id: questId }, { $inc: { slotsRemaining: 1, slotsTaken: -1 } });
    }

    /** Allocates the next completion rank. Only ever called by the worker holding the claim's lease. */
    static async nextCompletionRank(questId: Types.ObjectId | string): Promise<number> {
        const updated = await Quest.findOneAndUpdate(
            { _id: questId },
            { $inc: { completionCount: 1 } },
            { returnDocument: "after", projection: { completionCount: 1 } }
        );

        return updated?.completionCount ?? 1;
    }

    static async setMessage(questId: Types.ObjectId | string, channelId: string, messageId: string): Promise<void> {
        await Quest.updateOne({ _id: questId }, { $set: { channelId, messageId } });
    }

    static async findDueToExpire(now = new Date(), limit = 200): Promise<IQuest[]> {
        return Quest.find({ status: { $in: ["open", "closed"] }, endsAt: { $lte: now } }).limit(limit);
    }

    static async markExpired(questId: Types.ObjectId | string): Promise<void> {
        await Quest.updateOne({ _id: questId }, { $set: { status: "expired" } });
    }

    /**
     * Repairs slots orphaned by a crash between reserving and inserting the claim.
     *
     * Only looks at quests that appear full, and re-asserts `slotsRemaining: 0` in the filter so a
     * legitimate reservation landing at the same moment is not clobbered.
     */
    static async reconcileSlots(limit = 50): Promise<number> {
        const suspects = await Quest.find({
            status: "open",
            slotsRemaining: 0,
            slotsTotal: { $ne: null },
        }).limit(limit);

        let repaired = 0;

        for (const quest of suspects) {
            const real = await QuestClaim.countDocuments({ questId: quest._id });
            const total = quest.slotsTotal ?? 0;
            if (real >= total) continue;

            const result = await Quest.updateOne(
                { _id: quest._id, slotsRemaining: 0 },
                { $set: { slotsRemaining: total - real, slotsTaken: real } }
            );
            if (result.modifiedCount > 0) repaired++;
        }

        return repaired;
    }
}
