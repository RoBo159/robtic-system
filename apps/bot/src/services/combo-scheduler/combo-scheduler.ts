import type { Client } from "discord.js";
import { COMBO_CONFIG } from "@constants";
import { Logger } from "@logger";
import { runComboCycle } from "./run-combo-cycle";

const CTX = "main:combo-scheduler";

let comboInterval: ReturnType<typeof setInterval> | null = null;

export function startComboScheduler(client: Client): void {
    if (comboInterval) return;
    comboInterval = setInterval(() => {
        runComboCycle(client).catch(err =>
            Logger.error(`Combo cycle failed: ${err}`, CTX)
        );
    }, COMBO_CONFIG.scanIntervalMs);

    Logger.info("Combo scheduler started", CTX);
}

export function stopComboScheduler(): void {
    if (comboInterval) {
        clearInterval(comboInterval);
        comboInterval = null;
    }
}
