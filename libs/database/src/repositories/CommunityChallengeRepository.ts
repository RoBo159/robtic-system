import type { Types } from "mongoose";
import { CommunityChallenge, type ICommunityChallenge } from "@database/models/CommunityChallenge";
import { CommunityContribution, type ICommunityContribution } from "@database/models/CommunityContribution";

export class CommunityChallengeRepository {
    static async findActive(guildId: string): Promise<ICommunityChallenge | null> {
        return CommunityChallenge.findOne({ guildId, status: "active" });
    }

    static async findById(challengeId: Types.ObjectId | string): Promise<ICommunityChallenge | null> {
        return CommunityChallenge.findById(challengeId);
    }

    /** Every challenge with a live embed to re-attach to after a restart. */
    static async findAllActive(limit = 500): Promise<ICommunityChallenge[]> {
        return CommunityChallenge.find({ status: "active" }).limit(limit);
    }

    static async findByWeek(guildId: string, weekKey: string): Promise<ICommunityChallenge | null> {
        return CommunityChallenge.findOne({ guildId, weekKey });
    }

    /** Null when this week's challenge already exists — the unique index is the arbiter. */
    static async create(input: Partial<ICommunityChallenge>): Promise<ICommunityChallenge | null> {
        try {
            return await CommunityChallenge.create(input) as unknown as ICommunityChallenge;
        } catch (err) {
            if ((err as { code?: number }).code === 11000) return null;
            throw err;
        }
    }

    static async setMessage(id: Types.ObjectId, channelId: string, messageId: string): Promise<void> {
        await CommunityChallenge.updateOne({ _id: id }, { $set: { channelId, messageId } });
    }

    /** Applies a batch of buffered contribution, returning the challenge with its new total. */
    static async addTotal(id: Types.ObjectId, amount: number): Promise<ICommunityChallenge | null> {
        return CommunityChallenge.findOneAndUpdate(
            { _id: id },
            { $inc: { total: amount } },
            { returnDocument: "after" }
        );
    }

    /** All challenges whose week is over and which still need settling. */
    static async leaseForSettlement(now = new Date()): Promise<ICommunityChallenge | null> {
        return CommunityChallenge.findOneAndUpdate(
            { status: "active", endsAt: { $lte: now } },
            { $set: { status: "settling" } },
            { returnDocument: "after" }
        );
    }

    /** Picks up a settlement abandoned by a crash. */
    static async findStuckSettling(limit = 5): Promise<ICommunityChallenge[]> {
        return CommunityChallenge.find({ status: "settling" }).limit(limit);
    }

    static async advanceCursor(id: Types.ObjectId, cursor: Types.ObjectId): Promise<void> {
        await CommunityChallenge.updateOne({ _id: id }, { $set: { settledCursor: cursor } });
    }

    static async markSettled(id: Types.ObjectId): Promise<void> {
        await CommunityChallenge.updateOne(
            { _id: id, status: "settling" },
            { $set: { status: "settled", settledAt: new Date() } }
        );
    }

    /**
     * Adds to a member's contribution for the week.
     *
     * `firstContributedAt` is only written on insert, so it records when they joined in — which is
     * what breaks ties in the ranking without letting a later contribution reorder them.
     */
    static async addContribution(
        guildId: string,
        weekKey: string,
        discordId: string,
        username: string,
        amount: number,
    ): Promise<void> {
        await CommunityContribution.updateOne(
            { guildId, weekKey, discordId },
            {
                $inc: { amount },
                $set: { username },
                $setOnInsert: { firstContributedAt: new Date() },
            },
            { upsert: true }
        );
    }

    static async topContributors(guildId: string, weekKey: string, limit = 5): Promise<ICommunityContribution[]> {
        return CommunityContribution.find({ guildId, weekKey })
            .sort({ amount: -1, firstContributedAt: 1 })
            .limit(limit)
            .lean<ICommunityContribution[]>();
    }

    /** One page of payable contributors, walked by _id so settlement can resume. */
    static async payableAfter(
        guildId: string,
        weekKey: string,
        minContribution: number,
        after: Types.ObjectId | null,
        limit: number,
    ): Promise<ICommunityContribution[]> {
        return CommunityContribution.find({
            guildId,
            weekKey,
            amount: { $gte: minContribution },
            ...(after ? { _id: { $gt: after } } : {}),
        })
            .sort({ _id: 1 })
            .limit(limit)
            .lean<ICommunityContribution[]>();
    }

    static async contributionFor(guildId: string, weekKey: string, discordId: string): Promise<ICommunityContribution | null> {
        return CommunityContribution.findOne({ guildId, weekKey, discordId });
    }

    static async countContributors(guildId: string, weekKey: string): Promise<number> {
        return CommunityContribution.countDocuments({ guildId, weekKey });
    }

    /**
     * Everything one member has ever contributed in this guild, across every week.
     *
     * An aggregate rather than a counter on QuestStats: contribution is written from a batched
     * flush that already touches this collection, and a second counter would be one more thing to
     * keep in step for a number only the profile reads.
     */
    static async lifetimeContribution(guildId: string, discordId: string): Promise<number> {
        const [row] = await CommunityContribution.aggregate<{ total: number }>([
            { $match: { guildId, discordId } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);

        return row?.total ?? 0;
    }

    static async recordPayout(id: Types.ObjectId, rewardPaid: number): Promise<void> {
        await CommunityContribution.updateOne({ _id: id }, { $set: { rewardPaid } });
    }
}
