/** One line of the security audit trail — a kick, ban or role grant the bot observed. */
export interface AuditEntryResponse {
    eventName: string;
    source: string;
    actorId: string | null;
    targetId: string | null;
    channelId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}
