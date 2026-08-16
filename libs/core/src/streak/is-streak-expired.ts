import { STREAK_DEFAULTS } from "@constants";
import { streakExpiresAt } from "./streak-expires-at";

export function isStreakExpired(lastIncrement: Date, expireDays: number = STREAK_DEFAULTS.expireDays, now: Date = new Date()): boolean {
    return now.getTime() >= streakExpiresAt(lastIncrement, expireDays).getTime();
}
