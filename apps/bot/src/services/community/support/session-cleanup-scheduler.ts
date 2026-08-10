import { SESSION_CLEANUP_INTERVAL_MS } from "@constants";
import { Logger } from "@logger";
import { closeStaleSessions } from "./close-stale-sessions";

const CTX = "community:support";

let staleInterval: ReturnType<typeof setInterval> | null = null;

export function startSessionCleanupScheduler(): void {
    if (staleInterval) return;
    staleInterval = setInterval(() => {
        closeStaleSessions().catch(err =>
            Logger.error(`Session cleanup failed: ${err}`, CTX)
        );
    }, SESSION_CLEANUP_INTERVAL_MS);
    Logger.info("Support session cleanup scheduler started (every 5min, stale after 10min)", CTX);
}

export function stopSessionCleanupScheduler(): void {
    if (staleInterval) {
        clearInterval(staleInterval);
        staleInterval = null;
    }
}
