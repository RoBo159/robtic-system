import type { Client } from "discord.js";
import { VOICE_CONFIG } from "@constants";
import { Logger } from "@logger";
import { runVoiceTick } from "./run-voice-tick";
import { recoverStaleSessions } from "./recover-stale-sessions";
import { persistDirtySessions, sessionCount } from "../session-store";

const CTX = "voice";

let tickTimer: ReturnType<typeof setInterval> | null = null;
let persistTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Two timers, deliberately at different rates.
 *
 * The tick is the minute the whole system is denominated in. Persistence is far slower, because
 * writing every open session every minute would be thousands of writes a minute at scale for data
 * that only matters if the process dies — and the recovery path already reconstructs a crashed
 * session from its last persisted tick.
 */
export function startVoiceScheduler(client: Client): void {
    if (tickTimer) return;

    void recoverStaleSessions().catch(err => Logger.error(`Stale voice session recovery failed: ${err}`, CTX));

    tickTimer = setInterval(() => {
        runVoiceTick(client).catch(err => Logger.error(`Voice tick failed: ${err}`, CTX));
    }, VOICE_CONFIG.tickIntervalMs);

    persistTimer = setInterval(() => {
        persistDirtySessions()
            .then(count => {
                if (count) Logger.debug(`Persisted ${count} of ${sessionCount()} open voice session(s)`, CTX);
            })
            .catch(err => Logger.error(`Voice session persist failed: ${err}`, CTX));
    }, VOICE_CONFIG.persistIntervalMs);

    Logger.info("Voice scheduler started", CTX);
}

export function stopVoiceScheduler(): void {
    if (tickTimer) clearInterval(tickTimer);
    if (persistTimer) clearInterval(persistTimer);
    tickTimer = null;
    persistTimer = null;
}
