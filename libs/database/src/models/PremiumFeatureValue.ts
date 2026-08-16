import { Schema, model, type Document } from "mongoose";

/**
 * What one tier is worth for one feature — **global**, like the tier itself.
 *
 * Prime's quest bonus is one number for the whole bot. A row per (tier, feature) rather than a blob
 * on the tier: one write per edit, no lost updates between two operators, and a feature that has
 * never been configured is an absent row, which the engine reads as the definition's baseline
 * rather than as zero.
 *
 * `value` is Mixed because a feature is a flag, a percentage, a count or a duration depending on its
 * definition; the registry says which, and the config command validates against it.
 */
export interface IPremiumFeatureValue extends Document {
    /** `PremiumTier.key`. */
    tierKey: string;
    /** Registry key, e.g. `QUEST_REWARD_BONUS`. May outlive a feature removed from code. */
    feature: string;
    value: number | boolean;
    setBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const premiumFeatureValueSchema = new Schema<IPremiumFeatureValue>(
    {
        tierKey: { type: String, required: true, index: true },
        feature: { type: String, required: true },
        value: { type: Schema.Types.Mixed, required: true },
        setBy: { type: String, default: "" },
    },
    { timestamps: true }
);

premiumFeatureValueSchema.index({ tierKey: 1, feature: 1 }, { unique: true });

export const PremiumFeatureValue = model<IPremiumFeatureValue>("PremiumFeatureValue", premiumFeatureValueSchema);
