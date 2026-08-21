import { Schema, model, type Document } from "mongoose";

/**
 * A membership someone holds **everywhere**, independent of any server's roles.
 *
 * This is what makes the system a membership system rather than a role reader: a member granted
 * Prime here carries it into every server the bot is in, including ones that have never configured
 * a premium role. A server's role mapping is the *other* way to grant the same global tiers, for
 * servers that would rather run it off their own roles.
 *
 * `expiresAt` is null for a permanent grant (Lifetime, or a manual one). An expired row is left in
 * place rather than deleted — it is the record of what was held and when, and the engine simply
 * stops counting it.
 */
export interface IPremiumMembership extends Document {
    discordId: string;
    /** `PremiumTier.key`. */
    tierKey: string;
    /** Where it came from: `manual`, a payment reference, an import. */
    source: string;
    grantedBy: string;
    reason: string;
    /** Null means it never expires. */
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const premiumMembershipSchema = new Schema<IPremiumMembership>(
    {
        discordId: { type: String, required: true, index: true },
        tierKey: { type: String, required: true },
        source: { type: String, default: "manual" },
        grantedBy: { type: String, default: "" },
        reason: { type: String, default: "" },
        expiresAt: { type: Date, default: null },
    },
    { timestamps: true }
);

premiumMembershipSchema.index({ discordId: 1, tierKey: 1 }, { unique: true });
premiumMembershipSchema.index({ expiresAt: 1 });

export const PremiumMembership = model<IPremiumMembership>("PremiumMembership", premiumMembershipSchema);
