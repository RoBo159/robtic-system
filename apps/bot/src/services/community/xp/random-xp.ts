import { XP_CONFIG } from "@constants";

export function randomXP(): number {
    return Math.floor(Math.random() * (XP_CONFIG.maxPerMessage - XP_CONFIG.minPerMessage + 1)) + XP_CONFIG.minPerMessage;
}
