import { Schema, model, type Document, type Types } from "mongoose";

/**
 * One member's share of one weekly challenge.
 *
 * A separate collection rather than an array on the challenge: an embedded list would be rewritten
 * in full on every contribution and would contend on a single document for the whole server. This
 * shape also makes the top five an indexed sort rather than an in-memory scan.
 */
export interface ICommunityContribution extends Document {
    _id: Types.ObjectId;
    guildId: string;
    weekKey: string;
    discordId: string;
    username: string;
    amount: number;
    /** Breaks ties by who got there first, so the leaderboard is stable between renders. */
    firstContributedAt: Date;
    rewardPaid: number;
    createdAt: Date;
    updatedAt: Date;
}

const communityContributionSchema = new Schema<ICommunityContribution>(
    {
        guildId: { type: String, required: true, index: true },
        weekKey: { type: String, required: true },
        discordId: { type: String, required: true },
        username: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        firstContributedAt: { type: Date, default: () => new Date() },
        rewardPaid: { type: Number, default: 0 },
    },
    { timestamps: true }
);

communityContributionSchema.index({ guildId: 1, weekKey: 1, discordId: 1 }, { unique: true });
// The top-five query, and the settlement cursor walks this too.
communityContributionSchema.index({ guildId: 1, weekKey: 1, amount: -1 });
// One member's whole contribution history, for the profile. Without it that sum is a collection
// scan over every week the server has ever run.
communityContributionSchema.index({ guildId: 1, discordId: 1 });

export const CommunityContribution = model<ICommunityContribution>(
    "CommunityContribution",
    communityContributionSchema
);
