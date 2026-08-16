import { DAY_MS, STREAK_DEFAULTS } from "@constants";
import { utcDayStart } from "./utc-day-start";

/**
 * UTC midnight at which a new claim becomes available.
 *
 * Whole calendar days, not a rolling window from the timestamp: a member who claims at 23:00 can
 * claim again at 00:00, which is what "daily" means to the person doing it.
 */
export function nextClaimAt(lastIncrement: Date, claimDays: number = STREAK_DEFAULTS.claimDays): Date {
    return new Date(utcDayStart(lastIncrement) + Math.max(1, claimDays) * DAY_MS);
}
