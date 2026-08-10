import { AuditLogEvent, type Guild } from "discord.js";
import { detectAuditEntry, type AuditEntryMatch } from "./detect-audit-entry";

export async function detectBanAuditEntry(guild: Guild, targetId: string): Promise<AuditEntryMatch | null> {
    return detectAuditEntry(guild, targetId, AuditLogEvent.MemberBanAdd);
}
