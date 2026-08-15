import { Schema, model, type Document } from "mongoose";

/**
 * One Points → RC conversion.
 *
 * The rate is stored per row rather than read back from settings, because a guild can change it
 * and a historical conversion has to keep meaning what it meant at the time. `fee` and `bonus` are
 * recorded even while both are always zero, so taxes and membership perks can be added later
 * without a migration or a second table.
 */
export interface IRcConversion extends Document {
    guildId: string;
    discordId: string;
    /** Points taken from the member. */
    pointsSpent: number;
    /** RC credited after fee and bonus. */
    rcGranted: number;
    /** Points-per-RC in force at the time. */
    rate: number;
    /** Reserved for taxes — RC deducted. */
    fee: number;
    /** Reserved for memberships and events — RC added. */
    bonus: number;
    createdAt: Date;
}

const rcConversionSchema = new Schema<IRcConversion>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        pointsSpent: { type: Number, required: true },
        rcGranted: { type: Number, required: true },
        rate: { type: Number, required: true },
        fee: { type: Number, default: 0 },
        bonus: { type: Number, default: 0 },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

rcConversionSchema.index({ guildId: 1, discordId: 1, createdAt: -1 });

export const RcConversion = model<IRcConversion>("RcConversion", rcConversionSchema);
