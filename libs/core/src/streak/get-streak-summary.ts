import { StreakRepository } from "@database/repositories";
import type { IStreak } from "@database/models";
import { nextClaimAt } from "./next-claim-at";
import { streakExpiresAt } from "./streak-expires-at";

export interface StreakSummary {
    record: IStreak;
    rank: number;
    bestRank: number;
    /** Milliseconds remaining before the next streak claim is available. 0 if claimable now. */
    nextClaimMs: number;
    /** Milliseconds remaining until the streak expires, or null if there's no active streak. */
    expiresInMs: number | null;
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

    const nextClaimMs = record.active ? Math.max(0, nextClaimAt(record.lastIncrement).getTime() - Date.now()) : 0;
    const expiresInMs = record.active ? Math.max(0, streakExpiresAt(record.lastIncrement).getTime() - Date.now()) : null;

    return { record, rank, bestRank, nextClaimMs, expiresInMs };
}
