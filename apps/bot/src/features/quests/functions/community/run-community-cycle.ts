import type { Client, Guild } from "discord.js";
import { CommunityChallengeRepository } from "@database/repositories";
import { COMMUNITY_CONFIG } from "@constants";
import {
    ensureWeeklyChallenge,
    flushContributions,
    settleChallenge,
    setActiveChallenge,
} from "@core/quests";
import { Logger } from "@logger";
import { postCommunityPanel, refreshCommunityPanel, finalizeCommunityPanel } from "./render-community-panel";

const CTX = "quests";

/** Milestones already announced this week, so crossing 50% twice does not edit twice. */
const announced = new Map<string, Set<number>>();

/**
 * One guild's slice of the weekly challenge: open it, write buffered contribution, settle it.
 *
 * Contributions are flushed globally rather than per guild, so this only handles the guild-shaped
 * parts. The redraw is throttled downstream.
 */
export async function runCommunityCycle(client: Client, guild: Guild, now: Date): Promise<void> {
    const challenge = await ensureWeeklyChallenge(guild.id, now);

    setActiveChallenge(challenge, guild.id);

    if (challenge && !challenge.messageId) {
        await postCommunityPanel(client, challenge);
    }

    const due = await CommunityChallengeRepository.leaseForSettlement(now);
    if (due && due.guildId === guild.id) {
        const result = await settleChallenge(due);
        const settled = await CommunityChallengeRepository.findById(due._id);
        if (settled) await finalizeCommunityPanel(client, settled);

        announced.delete(`${due.guildId}:${due.weekKey}`);
        Logger.info(
            `Community challenge ${due.weekKey} for ${guild.id}: ${result.completed ? "completed" : "missed"}, ${result.paid} paid`,
            CTX,
        );
    }
}

/**
 * Writes every guild's buffered contribution and redraws what moved.
 *
 * Global because the buffer is: one pass writes all guilds, and only those that actually changed
 * cost an edit.
 */
export async function flushCommunityProgress(client: Client): Promise<void> {
    const flushed = await flushContributions();

    for (const entry of flushed) {
        const challenge = await CommunityChallengeRepository.findById(entry.challengeId);
        if (!challenge) continue;

        refreshCommunityPanel(client, entry.challengeId, crossedMilestone(challenge.guildId, challenge.weekKey,
            challenge.target > 0 ? challenge.total / challenge.target : 0));
    }
}

/** True the first time a fraction crosses one of the configured milestones. */
function crossedMilestone(guildId: string, weekKey: string, fraction: number): boolean {
    const key = `${guildId}:${weekKey}`;
    let seen = announced.get(key);
    if (!seen) {
        seen = new Set();
        announced.set(key, seen);
    }

    for (const milestone of COMMUNITY_CONFIG.milestones) {
        if (fraction >= milestone && !seen.has(milestone)) {
            seen.add(milestone);
            return true;
        }
    }

    return false;
}
