import { AuditLogEvent, type Guild } from "discord.js";
import { AUDIT_ENTRY_MAX_AGE_MS, AUDIT_ENTRY_FETCH_LIMIT, SECURITY_MESSAGES } from "@constants";

export interface AuditEntryMatch {
    executorId: string;
    reason: string;
}

/** Finds who just performed `type` on `targetId`, if the audit log recorded it within the attribution window. */
export async function detectAuditEntry(
    guild: Guild,
    targetId: string,
    type: AuditLogEvent,
): Promise<AuditEntryMatch | null> {
    const logs = await guild.fetchAuditLogs({ type, limit: AUDIT_ENTRY_FETCH_LIMIT }).catch(() => null);
    const entry = logs?.entries.find((item) => {
        // Widened across event types here, so `target` is a union whose members don't all carry `id`.
        const target = item.target as { id?: string } | null;
        if (!target || target.id !== targetId) return false;
        return Date.now() - item.createdTimestamp < AUDIT_ENTRY_MAX_AGE_MS;
    });

    if (!entry?.executor?.id) return null;

    return {
        executorId: entry.executor.id,
        reason: entry.reason ?? SECURITY_MESSAGES.noReasonProvided,
    };
}
