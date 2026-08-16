import { Schema, model, type Document } from "mongoose";

/**
 * Guild-level premium configuration.
 *
 * Separate from the tiers so a server can switch every perk off in one write — during an event, or
 * while re-planning its ladder — without deleting the tiers and their configured values.
 *
 * A guild with no document at all is the normal state: premium is globally available, inert until
 * roles are mapped, and this row only appears once someone changes something.
 */
export interface IPremiumSettings extends Document {
    guildId: string;
    /** Off means every lookup answers with the baselines, whatever the tiers say. */
    enabled: boolean;
    /** Show the tier badge on profiles and leaderboards. */
    showBadges: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const premiumSettingsSchema = new Schema<IPremiumSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        enabled: { type: Boolean, default: true },
        showBadges: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const PremiumSettings = model<IPremiumSettings>("PremiumSettings", premiumSettingsSchema);
