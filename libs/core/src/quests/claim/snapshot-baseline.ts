import {
    ActivityRepository,
    PointsRepository,
    VoiceRepository,
    StreakRepository,
} from "@database/repositories";
import type { QuestMetric } from "@core/metrics";

/**
 * Metrics whose lifetime total is already stored somewhere durable.
 *
 * For these, progress can be *derived* as `current - baseline` instead of only accumulated, which
 * is what lets a crash that loses buffered deltas heal itself. The rest — combo score, combo heat,
 * level-ups, community contribution — have no per-member running total to subtract from and are
 * accumulation-only.
 */
export const RECONCILABLE_METRICS: readonly QuestMetric[] = [
    "messages",
    "xp",
    "voiceTime",
    "voiceXp",
    "pointsEarned",
    "streak",
];

export function isReconcilable(metric: QuestMetric): boolean {
    return RECONCILABLE_METRICS.includes(metric);
}

/**
 * Reads the durable totals a claim will be measured against.
 *
 * Taken once, at claim time, and frozen onto the claim. Only the metrics the claim's missions
 * actually use are read, so a single-mission quest costs one query rather than four.
 */
export async function snapshotBaseline(
    guildId: string,
    discordId: string,
    username: string,
    metrics: readonly QuestMetric[],
): Promise<Record<string, number>> {
    const wanted = new Set(metrics.filter(isReconcilable));
    if (wanted.size === 0) return {};

    const baseline: Record<string, number> = {};

    if (wanted.has("messages") || wanted.has("xp")) {
        const activity = await ActivityRepository.findOrCreate(discordId, guildId, username);
        if (wanted.has("messages")) baseline.messages = activity.realMessageCount ?? 0;
        if (wanted.has("xp")) baseline.xp = activity.totalXP ?? 0;
    }

    if (wanted.has("voiceTime") || wanted.has("voiceXp")) {
        const voice = await VoiceRepository.getStat(guildId, discordId);
        if (wanted.has("voiceTime")) baseline.voiceTime = voice?.totalActiveSeconds ?? 0;
        if (wanted.has("voiceXp")) baseline.voiceXp = voice?.totalXpEarned ?? 0;
    }

    if (wanted.has("pointsEarned")) {
        const wallet = await PointsRepository.get(guildId, discordId);
        baseline.pointsEarned = wallet?.lifetimePoints ?? 0;
    }

    if (wanted.has("streak")) {
        // A level metric: progress is the value reached, so the baseline is only informational.
        const streak = await StreakRepository.find(discordId, guildId);
        baseline.streak = streak?.currentStreak ?? 0;
    }

    return baseline;
}

/** The same totals, read now, for comparison against a stored baseline. */
export async function currentTotals(
    guildId: string,
    discordId: string,
    username: string,
    metrics: readonly QuestMetric[],
): Promise<Record<string, number>> {
    return snapshotBaseline(guildId, discordId, username, metrics);
}
