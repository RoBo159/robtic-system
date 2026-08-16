import { Schema, model, type Document, type Types } from "mongoose";

export const CHALLENGE_STATUSES = ["active", "settling", "settled", "expired"] as const;
export type ChallengeStatus = typeof CHALLENGE_STATUSES[number];

export interface IChallengeMission {
    missionId: string;
    templateKey: string;
    metric: string;
    target: number;
    label: string;
}

/**
 * One week's server-wide challenge.
 *
 * `channelId`/`messageId` live here rather than in `ServerConfig.sentPanels` because a panel row is
 * keyed by name and would be overwritten by next week's challenge, losing the link between a
 * finished challenge and the message that announced it.
 */
export interface ICommunityChallenge extends Document {
    _id: Types.ObjectId;
    guildId: string;
    /** UTC ISO week, e.g. "2026-W33". */
    weekKey: string;
    status: ChallengeStatus;
    missions: IChallengeMission[];
    /** Combined target across missions — the number the progress bar fills toward. */
    target: number;
    /** Total contributed so far. Written from the buffer, not per event. */
    total: number;
    channelId: string | null;
    messageId: string | null;
    /** Paid to every contributor at or above the floor; ranks 1-5 get a multiplier. */
    rewardBase: number;
    minContribution: number;
    startedAt: Date;
    endsAt: Date;
    settledAt: Date | null;
    /**
     * Resume point for settlement, as the last paid contribution's _id.
     *
     * Paying thousands of contributors is chunked, and a crash halfway must not restart from the
     * beginning — the idempotency key makes that safe but not fast.
     */
    settledCursor: Types.ObjectId | null;
    contributorCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const challengeMissionSchema = new Schema<IChallengeMission>(
    {
        missionId: { type: String, required: true },
        templateKey: { type: String, required: true },
        metric: { type: String, required: true },
        target: { type: Number, required: true },
        label: { type: String, required: true },
    },
    { _id: false }
);

const communityChallengeSchema = new Schema<ICommunityChallenge>(
    {
        guildId: { type: String, required: true, index: true },
        weekKey: { type: String, required: true },
        status: { type: String, required: true, enum: CHALLENGE_STATUSES, default: "active" },
        missions: { type: [challengeMissionSchema], default: [] },
        target: { type: Number, required: true },
        total: { type: Number, default: 0 },
        channelId: { type: String, default: null },
        messageId: { type: String, default: null },
        rewardBase: { type: Number, required: true },
        minContribution: { type: Number, default: 1 },
        startedAt: { type: Date, default: () => new Date() },
        endsAt: { type: Date, required: true },
        settledAt: { type: Date, default: null },
        settledCursor: { type: Schema.Types.ObjectId, default: null },
        contributorCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

communityChallengeSchema.index({ guildId: 1, weekKey: 1 }, { unique: true });
communityChallengeSchema.index({ status: 1, endsAt: 1 });

export const CommunityChallenge = model<ICommunityChallenge>("CommunityChallenge", communityChallengeSchema);
