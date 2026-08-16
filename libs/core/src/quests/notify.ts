import type { QuestTier } from "@constants";
import { Logger } from "@logger";

const CTX = "quests";

interface QuestOutcomeBase {
    guildId: string;
    discordId: string;
    username: string;
    tier: QuestTier;
    questId: string;
    claimId: string;
    /** The quest's objectives, already worded for display. */
    missions: { label: string; target: number; progress: number }[];
}

export interface QuestCompleted extends QuestOutcomeBase {
    reward: number;
    /** Finishing position among everyone who claimed this quest. */
    rank: number;
    durationMs: number;
}

export interface QuestExpired extends QuestOutcomeBase {
    missionsCompleted: number;
    missionsTotal: number;
}

export interface QuestNotifier {
    onCompleted?: (event: QuestCompleted) => void;
    onExpired?: (event: QuestExpired) => void;
}

/**
 * Where the engine announces a finished claim.
 *
 * A hook rather than a direct call because everything under `libs/core/src/quests` is deliberately
 * free of discord.js — a DM needs a gateway client, which lives two layers up. The bot feature
 * registers itself on boot; with nothing registered the engine simply pays out silently, which is
 * exactly what the API or a test harness wants.
 */
let notifier: QuestNotifier | null = null;

export function setQuestNotifier(next: QuestNotifier | null): void {
    notifier = next;
}

/**
 * Both announcements are fire-and-forget and swallow their own failures.
 *
 * They are called from the completion and expiry paths, which have already paid out or already
 * written the outcome. A member with DMs closed must not turn a successful reward into a logged
 * error, let alone roll anything back.
 */
export function announceCompleted(event: QuestCompleted): void {
    try {
        notifier?.onCompleted?.(event);
    } catch (err) {
        Logger.warn(`Quest completion notice failed for ${event.discordId}: ${err}`, CTX);
    }
}

export function announceExpired(event: QuestExpired): void {
    try {
        notifier?.onExpired?.(event);
    } catch (err) {
        Logger.warn(`Quest expiry notice failed for ${event.discordId}: ${err}`, CTX);
    }
}
