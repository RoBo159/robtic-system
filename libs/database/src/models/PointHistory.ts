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
    "premium",
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
    /**
     * Optional caller-supplied key making a movement replayable exactly once.
     *
     * A payer that can retry — anything driven by a lease, a buffer or a scheduler — can crash
     * between deciding to pay and recording it, and would otherwise pay twice on resume. The
     * partial unique index below turns the second attempt into an E11000 that `move` treats as
     * "already done". Absent for the interactive paths, which cannot replay.
     */
    idempotencyKey: string | null;
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
        idempotencyKey: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

pointHistorySchema.index({ guildId: 1, discordId: 1, createdAt: -1 });
pointHistorySchema.index({ guildId: 1, source: 1, createdAt: -1 });

// Partial, so the millions of rows without a key do not collide on null.
pointHistorySchema.index(
    { idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export const PointHistory = model<IPointHistory>("PointHistory", pointHistorySchema);
