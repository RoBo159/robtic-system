import { DAY_MS, STREAK_DEFAULTS } from "@constants";
import { utcDayStart } from "./utc-day-start";

/** UTC midnight at which the streak dies if no claim is made by then. */
export function streakExpiresAt(lastIncrement: Date, expireDays: number = STREAK_DEFAULTS.expireDays): Date {
    return new Date(utcDayStart(lastIncrement) + Math.max(2, expireDays) * DAY_MS);
}
