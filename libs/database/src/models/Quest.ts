import { Schema, model, type Document, type Types } from "mongoose";
import { QUEST_TIERS, type QuestTier } from "@constants";

export const QUEST_STATUSES = ["open", "closed", "expired"] as const;
export type QuestStatus = typeof QUEST_STATUSES[number];

/**
 * A mission as it was at generation.
 *
 * Frozen, never a reference into the registry: a quest that is already live must keep meaning what
 * it meant when members claimed it, even if the template is retuned or deleted the next day.
 */
export interface IQuestMission {
    missionId: string;
    /** Registry key, kept for grouping and stats. May no longer resolve. */
    templateKey: string;
    metric: string;
    accumulation: "sum" | "max";
    target: number;
    label: string;
}

/** One generated quest, offered to a guild. Members claim it; it is never deleted. */
export interface IQuest extends Document {
    _id: Types.ObjectId;
    guildId: string;
    tier: QuestTier;
    /** Identifies the generation occasion, e.g. "2026-08-15#morning". Unique per guild+tier. */
    cycleKey: string;
    status: QuestStatus;
    missions: IQuestMission[];
    reward: number;
    /**
     * Slots left, decremented atomically on claim.
     *
     * A single number rather than comparing two fields, so the reservation is one indexed
     * predicate. Unlimited tiers are seeded to QUEST_UNLIMITED_SLOTS instead of being special-cased.
     */
    slotsRemaining: number;
    slotsTaken: number;
    /** What was offered, for display. Null means unlimited. */
    slotsTotal: number | null;
    /** Allocates completionRank. Only ever incremented. */
    completionCount: number;
    /** When the quest — and therefore every claim on it — ends. */
    endsAt: Date;
    channelId: string | null;
    messageId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const questMissionSchema = new Schema<IQuestMission>(
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

const questSchema = new Schema<IQuest>(
    {
        guildId: { type: String, required: true, index: true },
        tier: { type: String, required: true, enum: QUEST_TIERS },
        cycleKey: { type: String, required: true },
        status: { type: String, required: true, enum: QUEST_STATUSES, default: "open" },
        missions: { type: [questMissionSchema], default: [] },
        reward: { type: Number, required: true },
        slotsRemaining: { type: Number, required: true },
        slotsTaken: { type: Number, default: 0 },
        slotsTotal: { type: Number, default: null },
        completionCount: { type: Number, default: 0 },
        endsAt: { type: Date, required: true },
        channelId: { type: String, default: null },
        messageId: { type: String, default: null },
    },
    { timestamps: true }
);

questSchema.index({ guildId: 1, tier: 1, cycleKey: 1 }, { unique: true });
questSchema.index({ status: 1, endsAt: 1 });
questSchema.index({ guildId: 1, status: 1, tier: 1 });

export const Quest = model<IQuest>("Quest", questSchema);
