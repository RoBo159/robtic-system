import { Schema, model, type Document } from "mongoose";

/**
 * The one thing a *server* configures: which of its Discord roles grants which global tier.
 *
 * Nothing here defines what a tier is worth — that is global. A guild is only answering "in my
 * server, this role means Prime". A guild that maps nothing simply has no role-granted premium,
 * which is the default state and costs nothing.
 *
 * One row per (guild, role) so a role cannot mean two tiers at once; that would make "which tier is
 * this member" depend on rank ordering nobody configured on purpose.
 */
export interface IPremiumRoleMap extends Document {
    guildId: string;
    roleId: string;
    /** `PremiumTier.key`. */
    tierKey: string;
    addedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const premiumRoleMapSchema = new Schema<IPremiumRoleMap>(
    {
        guildId: { type: String, required: true, index: true },
        roleId: { type: String, required: true },
        tierKey: { type: String, required: true },
        addedBy: { type: String, default: "" },
    },
    { timestamps: true }
);

premiumRoleMapSchema.index({ guildId: 1, roleId: 1 }, { unique: true });

export const PremiumRoleMap = model<IPremiumRoleMap>("PremiumRoleMap", premiumRoleMapSchema);
