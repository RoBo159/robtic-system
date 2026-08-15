import { VoiceRepository } from "@database/repositories";
import { VOICE_CONFIG } from "@constants";
import { Logger } from "@logger";

const CTX = "voice";

/**
 * Closes sessions a crash left open.
 *
 * A live session has its `lastTickAt` moved every minute, so anything still open with a much older
 * tick cannot be live — the process that owned it is gone. Each is closed at its last known good
 * moment rather than at now, so a bot that was down overnight does not credit everyone with eight
 * hours they did not spend connected.
 */
export async function recoverStaleSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - VOICE_CONFIG.staleSessionMs);
    const stale = await VoiceRepository.findStaleOpenSessions(cutoff).catch(() => null);
    if (!stale?.length) return 0;

    for (const session of stale) {
        await VoiceRepository.closeSession(
            String(session._id),
            session.guildId,
            session.discordId,
            session.username,
            {
                connectedSeconds: session.connectedSeconds,
                activeSeconds: session.activeSeconds,
                xpEarned: session.xpEarned,
            },
            session.lastTickAt,
        ).catch(err => Logger.warn(`Could not close stale voice session ${session._id}: ${err}`, CTX));
    }

    Logger.info(`Closed ${stale.length} voice session(s) left open by a previous run`, CTX);
    return stale.length;
}
