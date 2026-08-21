import { ApiRequestLogRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "robtic-api";

/**
 * Exactly-once semantics for a mutating route.
 *
 * The plugin queues writes while the API is unreachable and replays them when it returns, so the
 * same coin credit can legitimately arrive twice. The first arrival claims the id; a replay finds
 * the claim and is served the original response without repeating the work.
 *
 * A claim whose work then throws is released, so the caller's own retry is not mistaken for a
 * duplicate and silently skipped — the failure mode that would otherwise lose a transaction.
 */
export async function withIdempotency<T>(
    requestId: string | null,
    guildId: string,
    route: string,
    work: () => Promise<T>,
): Promise<{ result: T; duplicate: boolean }> {
    if (!requestId) {
        return { result: await work(), duplicate: false };
    }

    const existing = await ApiRequestLogRepository.claim(requestId, guildId, route);
    if (existing) {
        Logger.debug(`Replayed request ${requestId} on ${route}`, CTX);
        return { result: existing as T, duplicate: true };
    }

    try {
        const result = await work();
        await ApiRequestLogRepository.complete(requestId, result as Record<string, unknown>);
        return { result, duplicate: false };
    } catch (error) {
        await ApiRequestLogRepository.release(requestId).catch(releaseError =>
            Logger.error(`Failed to release idempotency claim ${requestId}: ${releaseError}`, CTX),
        );
        throw error;
    }
}
