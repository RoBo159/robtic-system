import { Schema, model, type Document } from "mongoose";

/**
 * Where a Point movement came from.
 *
 * Kept open-ended deliberately — a new earning system adds a source here and nothing else in the
 * ledger changes. `coin-migration` records the one-time move of legacy Coin balances.
 */
export const POINT_SOURCES = [
    "message",
    "combo",
    "streak",
    "voice",
    "quest",
    "community",
    "admin",
    "conversion",
    "coin-migration",
] as const;

export type PointSource = typeof POINT_SOURCES[number];

/**
 * An append-only ledger of every Point movement.
 *
 * Never updated, only inserted, so the balance on Point can always be explained and a bad award
 * can be traced rather than guessed at. Spending is a negative amount with the same shape.
 */
export interface IPointHistory extends Document {
    guildId: string;
    discordId: string;
    /** Signed: positive earned, negative spent or converted away. */
    amount: number;
    source: PointSource;
    /** Free-text context, e.g. "5 day streak" or the admin's reason. */
    detail: string;
    /** Balance immediately after this movement, so a ledger reads without re-summing. */
    balanceAfter: number;
    /** Who caused it, when that is someone other than the member. */
    actorId: string | null;
    createdAt: Date;
}

const pointHistorySchema = new Schema<IPointHistory>(
    {
        guildId: { type: String, required: true, index: true },
        discordId: { type: String, required: true, index: true },
        amount: { type: Number, required: true },
        source: { type: String, required: true, enum: POINT_SOURCES },
        detail: { type: String, default: "" },
        balanceAfter: { type: Number, required: true },
        actorId: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

pointHistorySchema.index({ guildId: 1, discordId: 1, createdAt: -1 });
pointHistorySchema.index({ guildId: 1, source: 1, createdAt: -1 });

export const PointHistory = model<IPointHistory>("PointHistory", pointHistorySchema);
