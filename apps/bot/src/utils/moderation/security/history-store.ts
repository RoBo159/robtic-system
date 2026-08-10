import type { SecurityEventType, SecurityRule } from "../config";

/** Sliding-window timestamps of moderator actions, keyed by guild+moderator+event. */
export const actionHistory = new Map<string, number[]>();

/** Last time each rule fired for a moderator, so one burst doesn't trigger repeatedly. */
export const lastViolationTrigger = new Map<string, number>();

export function historyKey(guildId: string, moderatorId: string, event: SecurityEventType): string {
    return `${guildId}:${moderatorId}:${event}`;
}

export function triggerKey(guildId: string, moderatorId: string, rule: SecurityRule): string {
    return `${guildId}:${moderatorId}:${rule.event}:${rule.limit}:${rule.windowMs}:${rule.actions.join(",")}`;
}

export function cleanHistory(items: number[], now: number, windowMs: number): number[] {
    return items.filter((timestamp) => now - timestamp <= windowMs);
}
