import type { IQuestWindow } from "@database/models";
import { occasionRandom } from "./seeded-random";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** One occurrence of a configured window on a particular local day. */
export interface WindowOccurrence {
    /** "2026-08-15#morning" — the local date plus the window key. */
    windowKey: string;
    startMs: number;
    endMs: number;
}

/**
 * The guild's local calendar date for an instant, as YYYY-MM-DD.
 *
 * Shifting the instant by the offset and then reading UTC parts is the whole of the timezone
 * handling. A fixed offset drifts by an hour across DST for observing guilds — accepted, because
 * nothing else in the bot models timezones and the alternative is a full IANA dependency.
 */
export function localDateKey(atMs: number, utcOffsetMinutes: number): string {
    return new Date(atMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** UTC midnight of the guild's local day containing `atMs`. */
function localDayStartUtc(atMs: number, utcOffsetMinutes: number): number {
    const shifted = new Date(atMs + utcOffsetMinutes * 60_000);
    const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    return midnightShifted - utcOffsetMinutes * 60_000;
}

/**
 * Every occurrence of the enabled windows between two instants.
 *
 * The lookback exists so a bot that was down for a day can still see — and tombstone — the windows
 * it missed; the lookahead so a window opening shortly after the tick is planned before it starts,
 * rather than being noticed once it is already underway.
 */
export function enumerateOccurrences(
    windows: IQuestWindow[],
    utcOffsetMinutes: number,
    fromMs: number,
    toMs: number,
): WindowOccurrence[] {
    const occurrences: WindowOccurrence[] = [];
    const firstDay = localDayStartUtc(fromMs, utcOffsetMinutes);
    const lastDay = localDayStartUtc(toMs, utcOffsetMinutes);

    for (let dayStart = firstDay; dayStart <= lastDay; dayStart += DAY_MS) {
        const dateKey = localDateKey(dayStart + HOUR_MS, utcOffsetMinutes);

        for (const window of windows) {
            if (!window.enabled) continue;

            const startMs = dayStart + window.startHour * HOUR_MS;
            // An end hour at or before the start reads as crossing midnight.
            const endHour = window.endHour > window.startHour ? window.endHour : window.endHour + 24;
            const endMs = dayStart + endHour * HOUR_MS;

            if (endMs < fromMs || startMs > toMs) continue;

            occurrences.push({ windowKey: `${dateKey}#${window.key}`, startMs, endMs });
        }
    }

    return occurrences.sort((a, b) => a.startMs - b.startMs);
}

/**
 * The instant a tier will appear inside an occurrence.
 *
 * Derived from the occasion rather than rolled, so it is stable across restarts and across
 * concurrent planners. This is the single decision every restart-safety property depends on.
 */
export function scheduledInstantFor(
    guildId: string,
    tier: string,
    occurrence: WindowOccurrence,
): Date {
    const random = occasionRandom(guildId, tier, occurrence.windowKey);
    const span = Math.max(0, occurrence.endMs - occurrence.startMs);
    return new Date(occurrence.startMs + Math.floor(random() * span));
}

/** The UTC ISO week key for an instant in the guild's local time, e.g. "2026-W33". */
export function localWeekKey(atMs: number, utcOffsetMinutes: number): string {
    const shifted = new Date(atMs + utcOffsetMinutes * 60_000);
    const target = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));

    // ISO-8601: week 1 is the one containing the first Thursday, and weeks start on Monday.
    const dayNumber = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNumber + 3);

    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

    const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
