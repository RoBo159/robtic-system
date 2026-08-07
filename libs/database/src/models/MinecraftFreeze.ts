import { Schema, model, type Document } from "mongoose";

/**
 * A freeze, live or historic. Persisted rather than held in plugin memory so that logging out
 * does not thaw a player — the plugin re-reads this on join and re-applies the state.
 *
 * `disconnectedWhileFrozen` is set when a frozen player quits, which is the signal the staff
 * notification is built from.
 */
export interface IMinecraftFreeze extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    frozenByUuid: string;
    frozenByUsername: string;
    reason?: string;
    frozenAt: Date;
    active: boolean;
    unfrozenAt?: Date;
    unfrozenByUuid?: string;
    disconnectedWhileFrozen: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftFreezeSchema = new Schema<IMinecraftFreeze>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverId: { type: String, required: true, trim: true },
        frozenByUuid: { type: String, required: true, lowercase: true, trim: true },
        frozenByUsername: { type: String, required: true, trim: true },
        reason: { type: String, trim: true },
        frozenAt: { type: Date, default: Date.now },
        active: { type: Boolean, default: true, index: true },
        unfrozenAt: { type: Date },
        unfrozenByUuid: { type: String, lowercase: true, trim: true },
        disconnectedWhileFrozen: { type: Boolean, default: false },
    },
    { timestamps: true }
);

minecraftFreezeSchema.index(
    { guildId: 1, minecraftUuid: 1 },
    { unique: true, partialFilterExpression: { active: true } }
);

export const MinecraftFreeze = model<IMinecraftFreeze>("MinecraftFreeze", minecraftFreezeSchema);
