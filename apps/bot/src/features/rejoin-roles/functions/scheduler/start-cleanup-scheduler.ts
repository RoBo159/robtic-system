import type { Client } from "discord.js";
import { REJOIN_ROLES_CLEANUP_INTERVAL_MS } from "@constants";
import { Logger } from "@logger";
import { purgeExpiredSavedRoles } from "./purge-expired-saved-roles";

const CTX = "rejoin-roles";

let timer: ReturnType<typeof setInterval> | null = null;

export function startRejoinRolesScheduler(client: Client): void {
    if (timer) return;

    timer = setInterval(() => {
        purgeExpiredSavedRoles(client).catch(err => Logger.error(`Cleanup cycle failed: ${err}`, CTX));
    }, REJOIN_ROLES_CLEANUP_INTERVAL_MS);

    Logger.info("Rejoin-roles cleanup scheduler started", CTX);
}

export function stopRejoinRolesScheduler(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}
