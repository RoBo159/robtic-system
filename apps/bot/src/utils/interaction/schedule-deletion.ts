import { ERROR_REPLY_LIFETIME_MS } from "@constants";

/** Auto-deletes a bot error reply after a few seconds so it doesn't linger in chat. */
export function scheduleDeletion(deleteFn: () => Promise<unknown>): void {
    setTimeout(() => {
        deleteFn().catch(() => null);
    }, ERROR_REPLY_LIFETIME_MS);
}
