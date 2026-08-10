import type { Client } from "discord.js";
import { DECAY_CONFIG } from "@constants";
import { Logger } from "@logger";
import { runDecayCycle } from "./run-decay-cycle";

let decayInterval: ReturnType<typeof setInterval> | null = null;

export function startDecayScheduler(client: Client): void {
    if (decayInterval) return;
    decayInterval = setInterval(() => {
        runDecayCycle(client).catch(err =>
            Logger.error(`Decay cycle failed: ${err}`, "community")
        );
    }, DECAY_CONFIG.checkIntervalMs);

    Logger.info("XP decay scheduler started", "community");
}

export function stopDecayScheduler(): void {
    if (decayInterval) {
        clearInterval(decayInterval);
        decayInterval = null;
    }
}
