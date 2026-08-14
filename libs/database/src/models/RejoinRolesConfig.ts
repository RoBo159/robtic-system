import { Schema, model, type Document } from "mongoose";

/**
 * Per-guild settings for restoring a member's roles when they come back.
 *
 * Two windows rather than one, and the staff window is always the shorter of the two: a returning
 * member getting their colour and cosmetic roles back is harmless, whereas silently handing back
 * moderator powers to someone who left a week ago is not. The invariant is enforced on write —
 * see RejoinRolesConfigRepository.setWindows.
 */
export interface IRejoinRolesConfig extends Document {
    guildId: string;
    /** Never saved and never restored, whoever held them. */
    excludedRoleIds: string[];
    /**
     * Roles treated as staff for the shorter window. Empty means fall back to the guild's StaffTier
     * bindings, which is what the hardcoded behaviour did before this was configurable.
     */
    staffRoleIds: string[];
    /** How long an ordinary saved role survives, in hours. Also when the snapshot is purged. */
    retentionHours: number;
    /** How long a staff role survives, in hours. Always < retentionHours. */
    staffRetentionHours: number;
    createdAt: Date;
    updatedAt: Date;
}

const rejoinRolesConfigSchema = new Schema<IRejoinRolesConfig>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        excludedRoleIds: { type: [String], default: [] },
        staffRoleIds: { type: [String], default: [] },
        retentionHours: { type: Number, default: 168 },
        staffRetentionHours: { type: Number, default: 24 },
    },
    { timestamps: true }
);

export const RejoinRolesConfig = model<IRejoinRolesConfig>("RejoinRolesConfig", rejoinRolesConfigSchema);
