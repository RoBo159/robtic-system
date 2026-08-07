import { Schema, model, type Document } from "mongoose";

/**
 * A durable projection of a linked member's Discord roles.
 *
 * The plugin has no Discord API access, and the bridge queue is transient — an event that has
 * already been consumed cannot answer "is this player staff?" when they run `/admin` an hour
 * later. The bot therefore writes each linked member's current role ids here on every change, and
 * the API reads this collection to resolve staff rank and LuckPerms groups on demand.
 *
 * Discord remains the source of truth; this is a cache of it that survives a restart.
 */
export interface IMinecraftRoleState extends Document {
    guildId: string;
    discordId: string;
    minecraftUuid: string;
    /** Every Discord role id the member currently holds. */
    roleIds: string[];
    /** LuckPerms groups those roles map to, resolved at write time. */
    groups: string[];
    /** What triggered the last write, for debugging a stale projection. */
    reason: string;
    syncedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftRoleStateSchema = new Schema<IMinecraftRoleState>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        roleIds: { type: [String], default: [] },
        groups: { type: [String], default: [] },
        reason: { type: String, default: "unknown" },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

minecraftRoleStateSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
minecraftRoleStateSchema.index({ guildId: 1, minecraftUuid: 1 }, { unique: true });

export const MinecraftRoleState = model<IMinecraftRoleState>("MinecraftRoleState", minecraftRoleStateSchema);
