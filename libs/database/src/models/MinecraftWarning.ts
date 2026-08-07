import { Schema, model, type Document } from "mongoose";

/**
 * A warning issued in game. Kept permanently: a removal marks the row rather than deleting it, so
 * the history a join alert is built from stays complete and a removal is itself auditable.
 */
export interface IMinecraftWarning extends Document {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    reason: string;
    issuedByUuid: string;
    issuedByUsername: string;
    removed: boolean;
    removedAt?: Date;
    removedByUuid?: string;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftWarningSchema = new Schema<IMinecraftWarning>(
    {
        guildId: { type: String, required: true, index: true },
        minecraftUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        minecraftUsername: { type: String, required: true, trim: true },
        serverId: { type: String, required: true, trim: true },
        reason: { type: String, required: true, trim: true },
        issuedByUuid: { type: String, required: true, lowercase: true, trim: true },
        issuedByUsername: { type: String, required: true, trim: true },
        removed: { type: Boolean, default: false },
        removedAt: { type: Date },
        removedByUuid: { type: String, lowercase: true, trim: true },
    },
    { timestamps: true }
);

minecraftWarningSchema.index({ guildId: 1, minecraftUuid: 1, createdAt: -1 });

export const MinecraftWarning = model<IMinecraftWarning>("MinecraftWarning", minecraftWarningSchema);
