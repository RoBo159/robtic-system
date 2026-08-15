import { Schema, model, type Document } from "mongoose";

/**
 * The set of features this build ships, published by the bot at startup.
 *
 * The bot discovers features by scanning its own source tree, so the catalog only exists in its
 * memory — and the API runs as a separate process. Without this, the admin panel could read a
 * guild's GuildFeature rows but would have no idea which features exist, what they are called, or
 * what each one defaults to.
 *
 * The bot is the authority: it replaces this on every boot, so a deleted feature folder disappears
 * from the panel the next time the bot starts.
 */
export interface IFeatureCatalog extends Document {
    key: string;
    description: string;
    activation: "opt-in" | "default-on";
    /** Command names the feature owns, for display. */
    commands: string[];
    updatedAt: Date;
}

const featureCatalogSchema = new Schema<IFeatureCatalog>(
    {
        key: { type: String, required: true, unique: true, index: true },
        description: { type: String, required: true },
        activation: { type: String, required: true, enum: ["opt-in", "default-on"] },
        commands: { type: [String], default: [] },
    },
    { timestamps: true }
);

export const FeatureCatalog = model<IFeatureCatalog>("FeatureCatalog", featureCatalogSchema);
