import { Schema, model, type Document } from "mongoose";

/**
 * Idempotency ledger.
 *
 * The plugin queues writes while the API is unreachable and replays them afterwards, so the same
 * coin credit can arrive twice. Each mutating request carries a caller-generated id; this row is
 * inserted under a unique index before the write is applied, and a duplicate key error is what
 * tells the API the work is already done. The stored response is then returned verbatim, so the
 * replay is indistinguishable from the original to the caller.
 *
 * Rows expire via a TTL index — see API_IDEMPOTENCY_TTL_MS, which the `expiresAt` write mirrors.
 */
export interface IApiRequestLog extends Document {
    requestId: string;
    guildId: string;
    route: string;
    /** The response body the first attempt produced, replayed for any duplicate. */
    response: Record<string, unknown>;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const apiRequestLogSchema = new Schema<IApiRequestLog>(
    {
        requestId: { type: String, required: true, unique: true, index: true },
        guildId: { type: String, required: true },
        route: { type: String, required: true },
        response: { type: Schema.Types.Mixed, default: {} },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
);

apiRequestLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ApiRequestLog = model<IApiRequestLog>("ApiRequestLog", apiRequestLogSchema);
