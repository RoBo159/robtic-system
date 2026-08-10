import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { STALE_SESSION_MS } from "@constants";
import { Logger } from "@logger";
import { resolveSession } from "./resolve-session";

const CTX = "community:support";

export async function closeStaleSessions(): Promise<void> {
    const staleSessions = await SupportSessionRepository.findStale(STALE_SESSION_MS);
    for (const session of staleSessions) {
        if (session.claimedBy) {
            await resolveSession(session.userMessageId, session.guildId);
            Logger.debug(`Auto-resolved stale session msg=${session.userMessageId} (claimed by ${session.claimedBy})`, CTX);
        } else {
            await SupportSessionRepository.resolve(session.userMessageId, 0);
            Logger.debug(`Auto-closed stale unclaimed session msg=${session.userMessageId}`, CTX);
        }
    }
}
