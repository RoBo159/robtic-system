import { ApiRequestLog } from "@database/models/ApiRequestLog";
import { API_IDEMPOTENCY_TTL_MS } from "@sdk";

/** Mongo's duplicate-key error code, which is what signals a request has already been handled. */
const DUPLICATE_KEY = 11000;

export class ApiRequestLogRepository {
    /**
     * Claims a request id. Returns the stored response when the id has been seen before, and null
     * when this is the first sighting and the caller should go on to do the work.
     *
     * The insert is the lock: relying on the unique index rather than a read-then-write means two
     * concurrent replays of the same queued request cannot both pass the check.
     */
    static async claim(requestId: string, guildId: string, route: string): Promise<Record<string, unknown> | null> {
        try {
            await ApiRequestLog.create({
                requestId,
                guildId,
                route,
                response: {},
                expiresAt: new Date(Date.now() + API_IDEMPOTENCY_TTL_MS),
            });
            return null;
        } catch (error) {
            if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;

            const existing = await ApiRequestLog.findOne({ requestId });
            return existing?.response ?? {};
        }
    }

    /** Stores the response so a later replay returns exactly what the first attempt did. */
    static async complete(requestId: string, response: Record<string, unknown>): Promise<void> {
        await ApiRequestLog.updateOne({ requestId }, { $set: { response } });
    }

    /**
     * Drops a claim whose work failed, so the caller's retry is not mistaken for a duplicate and
     * silently skipped.
     */
    static async release(requestId: string): Promise<void> {
        await ApiRequestLog.deleteOne({ requestId });
    }
}
