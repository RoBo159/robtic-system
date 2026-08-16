import { CommunityChallengeRepository } from "@database/repositories";
import { publishMetric } from "@core/metrics";
import { Logger } from "@logger";

const CTX = "quests";

interface PendingContribution {
    guildId: string;
    weekKey: string;
    challengeId: string;
    total: number;
    members: Map<string, { username: string; amount: number }>;
}

/** guildId → what has been contributed since the last flush. */
const pending = new Map<string, PendingContribution>();

/**
 * Records a contribution toward the week's challenge.
 *
 * Buffered like individual quest progress, and for the same reason: the whole server feeds one
 * counter, so writing per event would hammer a single document. This keeps it to roughly one write
 * per guild per flush regardless of how busy the server is.
 */
export function recordContribution(
    guildId: string,
    weekKey: string,
    challengeId: string,
    discordId: string,
    username: string,
    amount: number,
): void {
    if (amount <= 0) return;

    let entry = pending.get(guildId);
    if (!entry || entry.weekKey !== weekKey) {
        entry = { guildId, weekKey, challengeId, total: 0, members: new Map() };
        pending.set(guildId, entry);
    }

    entry.total += amount;
    const member = entry.members.get(discordId);
    if (member) member.amount += amount;
    else entry.members.set(discordId, { username, amount });
}

/** Buffered total for a guild, so a render can show the newest number before it is written. */
export function pendingTotal(guildId: string): number {
    return pending.get(guildId)?.total ?? 0;
}

export interface ContributionFlush {
    guildId: string;
    challengeId: string;
    total: number;
}

/**
 * Writes buffered contributions.
 *
 * Returns what moved so the caller can redraw only the guilds that changed. Failures put the batch
 * back rather than dropping it — the same `$inc` reasoning as the quest progress buffer.
 */
export async function flushContributions(): Promise<ContributionFlush[]> {
    if (pending.size === 0) return [];

    const drained = [...pending.values()];
    pending.clear();

    const flushed: ContributionFlush[] = [];

    for (const entry of drained) {
        try {
            await CommunityChallengeRepository.addTotal(entry.challengeId as never, entry.total);

            for (const [discordId, member] of entry.members) {
                await CommunityChallengeRepository.addContribution(
                    entry.guildId,
                    entry.weekKey,
                    discordId,
                    member.username,
                    member.amount,
                );

                // Individual quests can carry a "contribute to the challenge" objective, so the
                // contribution is itself a metric.
                publishMetric({
                    guildId: entry.guildId,
                    discordId,
                    username: member.username,
                    metric: "communityContribution",
                    value: member.amount,
                });
            }

            flushed.push({ guildId: entry.guildId, challengeId: entry.challengeId, total: entry.total });
        } catch (err) {
            Logger.warn(`Could not flush community contributions for ${entry.guildId}: ${err}`, CTX);
            restore(entry);
        }
    }

    return flushed;
}

function restore(entry: PendingContribution): void {
    const current = pending.get(entry.guildId);

    if (!current || current.weekKey !== entry.weekKey) {
        pending.set(entry.guildId, entry);
        return;
    }

    current.total += entry.total;
    for (const [discordId, member] of entry.members) {
        const existing = current.members.get(discordId);
        if (existing) existing.amount += member.amount;
        else current.members.set(discordId, member);
    }
}

export function clearContributionBuffer(): void {
    pending.clear();
}
