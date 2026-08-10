import type { Client } from "discord.js";
import { STREAK_CONFIG } from "@constants";
import { Logger } from "@logger";
import { runStreakCycle } from "./run-streak-cycle";

const CTX = "main:streak-scheduler";

let streakInterval: ReturnType<typeof setInterval> | null = null;

export function startStreakScheduler(client: Client): void {
    if (streakInterval) return;
    streakInterval = setInterval(() => {
        runStreakCycle(client).catch(err =>
            Logger.error(`Streak cycle failed: ${err}`, CTX)
        );
    }, STREAK_CONFIG.checkIntervalMs);

    Logger.info("Streak scheduler started", CTX);
}

export function stopStreakScheduler(): void {
    if (streakInterval) {
        clearInterval(streakInterval);
        streakInterval = null;
    }
}
