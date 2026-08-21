import { Schema, model, type Document, type Types } from "mongoose";
import { QUEST_TIERS, type QuestTier } from "@constants";

export const QUEST_GENERATION_STATUSES = [
    "scheduled",
    "firing",
    "generated",
    "skipped",
    "missed",
    "failed",
] as const;
export type QuestGenerationStatus = typeof QUEST_GENERATION_STATUSES[number];

/**
 * The plan-and-fire log for quest generation.
 *
 * The row exists *before* the quest does. Planning rolls a random instant inside the window and
 * persists it; firing leases the row. That ordering is what makes generation survive restarts: a
 * time chosen at fire time would be different on every boot, and nothing would record that a
 * window had already been used.
 *
 * A window that elapsed entirely while the bot was down is inserted directly as `missed` — the row
 * is a tombstone that occupies the unique key so the occasion can never be planned again.
 */
export interface IQuestGenerationHistory extends Document {
    guildId: string;
    tier: QuestTier;
    /** The occasion: "2026-08-15#morning" for a window, "2026-W33" for a week planner. */
    windowKey: string;
    /** The instant chosen inside the window, frozen at plan time. */
    scheduledAt: Date;
    status: QuestGenerationStatus;
    questId: Types.ObjectId | null;
    /** Why it did not produce a quest. */
    reason: string;
    attempts: number;
    /** Week-planner rows only: how many of this tier the week should get. */
    plannedCount: number | null;
    /** Week-planner rows only: which occasions were chosen. */
    chosenWindowKeys: string[];
    firingAt: Date | null;
    generatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const questGenerationHistorySchema = new Schema<IQuestGenerationHistory>(
    {
        guildId: { type: String, required: true, index: true },
        tier: { type: String, required: true, enum: QUEST_TIERS },
        windowKey: { type: String, required: true },
        scheduledAt: { type: Date, required: true },
        status: { type: String, required: true, enum: QUEST_GENERATION_STATUSES, default: "scheduled" },
        questId: { type: Schema.Types.ObjectId, default: null },
        reason: { type: String, default: "" },
        attempts: { type: Number, default: 0 },
        plannedCount: { type: Number, default: null },
        chosenWindowKeys: { type: [String], default: [] },
        firingAt: { type: Date, default: null },
        generatedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

questGenerationHistorySchema.index({ guildId: 1, tier: 1, windowKey: 1 }, { unique: true });
questGenerationHistorySchema.index({ status: 1, scheduledAt: 1 });

export const QuestGenerationHistory = model<IQuestGenerationHistory>(
    "QuestGenerationHistory",
    questGenerationHistorySchema
);
