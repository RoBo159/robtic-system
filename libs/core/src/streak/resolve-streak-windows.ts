import { STREAK_DEFAULTS } from "@constants";

/** The three tunable windows, with the fallbacks applied. */
export interface StreakWindows {
    claimDays: number;
    expireDays: number;
    returnWindowHours: number;
}

/** Fields this reads. Structural rather than IStreakSettings so callers may pass a plain object. */
interface WindowSource {
    claimDays?: number | null;
    expireDays?: number | null;
    returnWindowHours?: number | null;
}

/**
 * The guild's windows, or the defaults where it has none.
 *
 * One place so a guild with no settings row, or a row written before these fields existed, behaves
 * exactly like the old hard-coded 1/2-day system instead of collapsing to zero. `expireDays` is
 * also forced above `claimDays`: a streak that expired before it could be claimed again would be
 * unwinnable, and clamping here means no caller has to think about it.
 */
export function resolveStreakWindows(settings: WindowSource | null | undefined): StreakWindows {
    const claimDays = Math.max(1, settings?.claimDays ?? STREAK_DEFAULTS.claimDays);
    const expireDays = Math.max(claimDays + 1, settings?.expireDays ?? STREAK_DEFAULTS.expireDays);

    return {
        claimDays,
        expireDays,
        returnWindowHours: Math.max(0, settings?.returnWindowHours ?? STREAK_DEFAULTS.returnWindowHours),
    };
}
