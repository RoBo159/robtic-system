import { StreakRepository, StreakSettingsRepository, StreakRecoveryRepository } from "@database/repositories";
import type { IStreak } from "@database/models";
import { nextClaimAt } from "./next-claim-at";
import { streakExpiresAt } from "./streak-expires-at";
import { resolveStreakWindows } from "./resolve-streak-windows";

export interface StreakSummary {
    record: IStreak;
    rank: number;
    bestRank: number;
    /** Milliseconds remaining before the next streak claim is available. 0 if claimable now. */
    nextClaimMs: number;
    /** Milliseconds remaining until the streak expires, or null if there's no active streak. */
    expiresInMs: number | null;
    /**
     * Milliseconds left for staff to return a just-lost streak, or null when none is pending.
     *
     * The member is told nothing when their streak breaks or when they post during this window —
     * this field is the only place they can see it, which is why the streak embed renders it.
     */
    pendingReturnMs: number | null;
    /** The streak that is waiting to be returned, 0 when none is. */
    pendingStreak: number;
}

/**
 * One member's streak standing.
 *
 * Domain rather than feature code: `/profile` and the profile menu both read it, and neither
 * belongs to the streak feature. Keeping it here is what lets `features/streak/` be deleted
 * without touching them.
 */
export async function getStreakSummary(discordId: string, guildId: string, username: string): Promise<StreakSummary> {
    const record = await StreakRepository.findOrCreate(discordId, guildId, username);
    const rank = await StreakRepository.getRank(discordId, guildId);
    const bestRank = await StreakRepository.getBestRank(discordId, guildId);
    const windows = resolveStreakWindows(await StreakSettingsRepository.get(guildId));

    const nextClaimMs = record.active
        ? Math.max(0, nextClaimAt(record.lastIncrement, windows.claimDays).getTime() - Date.now())
        : 0;
    const expiresInMs = record.active
        ? Math.max(0, streakExpiresAt(record.lastIncrement, windows.expireDays).getTime() - Date.now())
        : null;

    const pendingUntil = record.pendingReturnUntil?.getTime() ?? 0;
    const pendingReturnMs = pendingUntil > Date.now() ? pendingUntil - Date.now() : null;

    // The lost value lives on the recovery row — the streak's own counter was zeroed on expiry.
    // Only fetched while a return is actually pending, which is rare, so the common path stays at
    // three queries.
    const pending = pendingReturnMs !== null
        ? await StreakRecoveryRepository.find(discordId, guildId)
        : null;

    return {
        record,
        rank,
        bestRank,
        nextClaimMs,
        expiresInMs,
        pendingReturnMs,
        pendingStreak: pending?.currentStreak ?? 0,
    };
}
