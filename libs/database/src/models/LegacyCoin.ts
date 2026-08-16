import { Schema, model, type Document } from "mongoose";

/**
 * A frozen snapshot of the per-guild coin balances that existed before coins went global.
 *
 * Nothing spends from here and nothing credits it — the live wallet is `Coin`, which starts every
 * member at zero. This exists so a server can still claim what its members had earned there, once,
 * via `/points migrate-coins`, and so the old balances remain auditable afterwards rather than
 * being deleted outright.
 *
 * `migratedAt` marks a row as consumed. Rows are kept rather than removed so the transfer can be
 * reconciled by hand against the PointHistory rows it produced.
 */
export interface ILegacyCoin extends Document {
    guildId: string;
    discordId: string;
    username: string;
    /** The balance as it stood at the snapshot. Never changes. */
    coins: number;
    /** When this row was claimed into points, or null while it is still claimable. */
    migratedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const legacyCoinSchema = new Schema<ILegacyCoin>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        username: { type: String, default: "" },
        coins: { type: Number, default: 0 },
        migratedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

legacyCoinSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
// The claim query: unconsumed rows with something left to claim, for one guild.
legacyCoinSchema.index({ guildId: 1, migratedAt: 1 });

export const LegacyCoin = model<ILegacyCoin>("LegacyCoin", legacyCoinSchema);
