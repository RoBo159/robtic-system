import type { ICommunityChallenge } from "@database/models";
import type { MetricEvent, QuestMetric } from "@core/metrics";
import { recordContribution } from "./contribution-buffer";

/**
 * The active challenge per guild, as the metric path needs to see it.
 *
 * Kept in memory and refreshed by the scheduler rather than read per event: the intake path is
 * synchronous, and a database lookup on every message to ask "is there a challenge this week" is
 * exactly what the buffers exist to prevent.
 */
interface ActiveChallenge {
    challengeId: string;
    weekKey: string;
    metric: QuestMetric;
}

const active = new Map<string, ActiveChallenge>();

/** Called by the cycle each tick with whatever challenge is live. */
export function setActiveChallenge(challenge: ICommunityChallenge | null, guildId: string): void {
    const mission = challenge?.missions[0];

    if (!challenge || !mission || challenge.status !== "active") {
        active.delete(guildId);
        return;
    }

    active.set(guildId, {
        challengeId: String(challenge._id),
        weekKey: challenge.weekKey,
        metric: mission.metric as QuestMetric,
    });
}

export function forgetGuildChallenge(guildId: string): void {
    active.delete(guildId);
}

/**
 * Feeds a metric into the week's challenge when it is the one being measured.
 *
 * Counters only. A level metric — combo score, streak — describes one member's standing and cannot
 * meaningfully be summed across a server, so those are never chosen as community objectives and are
 * ignored here if one ever is.
 */
export function contributeFromMetric(event: MetricEvent): void {
    const challenge = active.get(event.guildId);
    if (!challenge || challenge.metric !== event.metric) return;

    recordContribution(
        event.guildId,
        challenge.weekKey,
        challenge.challengeId,
        event.discordId,
        event.username,
        event.value,
    );
}
