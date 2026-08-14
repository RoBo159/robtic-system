import { Schema, model, type Document } from "mongoose";

/**
 * One guild's explicit decision about one feature.
 *
 * Absence is meaningful: with no row the feature falls back to its manifest `activation`, so a
 * `default-on` feature works in a fresh guild without a single write, and an `opt-in` feature
 * costs exactly one row when someone turns it on.
 */
export interface IGuildFeature extends Document {
    guildId: string;
    /** Feature manifest key, e.g. "streak". */
    key: string;
    enabled: boolean;
    /** Who ran /feature enable|disable. */
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const guildFeatureSchema = new Schema<IGuildFeature>(
    {
        guildId: { type: String, required: true, index: true },
        key: { type: String, required: true },
        enabled: { type: Boolean, required: true },
        updatedBy: { type: String, default: "" },
    },
    { timestamps: true }
);

guildFeatureSchema.index({ guildId: 1, key: 1 }, { unique: true });

export const GuildFeature = model<IGuildFeature>("GuildFeature", guildFeatureSchema);
