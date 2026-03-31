

// Types and defaults inlined here
export type AuditChannelKey =
    | "member_join"
    | "member_leave"
    | "member_kick"
    | "member_ban"
    | "message_delete"
    | "channel_create"
    | "channel_delete"
    | "role_update"
    | "generic"; // For all other events

export type SecurityEventType =
    | "kick"
    | "ban"
    | "role_grant"
    | "role_remove"
    | "channel_create"
    | "channel_delete";

export type SecurityActionType = "kick" | "ban" | "remove_role" | "send_alert";

export interface ModerationAuditSettings {
    auditChannels: Record<AuditChannelKey, string>;
    securityLogChannelId: string;
    rolesToStrip: string[];
}

export interface SecurityRule {
    event: SecurityEventType;
    limit: number;
    windowMs: number;
    actions: SecurityActionType[];
}

export interface ModerationSecurityConfig {
    enabled: boolean;
    rules: SecurityRule[];
    whitelistUserIds: string[];
    whitelistRoleIds: string[];
    settings: ModerationAuditSettings;
}

export const MOD_SECURITY_CONFIG_KEY_PREFIX = "moderation-security";

export const DEFAULT_MODERATION_SECURITY_CONFIG: ModerationSecurityConfig = {
    enabled: false,
    rules: [],
    whitelistUserIds: [],
    whitelistRoleIds: [],
    settings: {
        auditChannels: {
            member_join: "",
            member_leave: "",
            member_kick: "",
            member_ban: "",
            message_delete: "",
            channel_create: "",
            channel_delete: "",
            role_update: "",
            generic: "", // Used for all other events
        },
        securityLogChannelId: "",
        rolesToStrip: [],
    },
};

export function buildSecurityConfigKey(guildId: string): string {
    return `${MOD_SECURITY_CONFIG_KEY_PREFIX}:${guildId}`;
}

export function parseWindowToMs(raw: string): number {
    const value = raw.trim().toLowerCase();
    const match = value.match(/^(\d+)\s*(s|m|h|d)?$/);
    if (!match) return 60_000;

    const amount = Number(match[1]);
    const unit = match[2] ?? "s";

    if (unit === "s") return amount * 1000;
    if (unit === "m") return amount * 60_000;
    if (unit === "h") return amount * 3_600_000;
    return amount * 86_400_000;
}

export function formatWindow(ms: number): string {
    if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
    if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
    if (ms % 60_000 === 0) return `${ms / 60_000}m`;
    return `${Math.max(1, Math.floor(ms / 1000))}s`;
}

export function normalizeSecurityConfig(value: unknown): ModerationSecurityConfig | undefined {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Partial<ModerationSecurityConfig>;

    if (!raw.settings || typeof raw.settings !== "object") return undefined;
    const incomingSettings = raw.settings as Partial<ModerationAuditSettings>;
    if (!incomingSettings.auditChannels || typeof incomingSettings.auditChannels !== "object") return undefined;

    const settings: ModerationAuditSettings = {
        auditChannels: { ...incomingSettings.auditChannels },
        securityLogChannelId: typeof incomingSettings.securityLogChannelId === "string"
            ? incomingSettings.securityLogChannelId
            : "",
        rolesToStrip: Array.isArray(incomingSettings.rolesToStrip)
            ? incomingSettings.rolesToStrip.filter((item: unknown): item is string => typeof item === "string")
            : [],
    };

    const rules = Array.isArray(raw.rules)
        ? raw.rules
            .map((rule: unknown) => {
                if (!rule || typeof rule !== "object") return null;
                const item = rule as Partial<SecurityRule>;
                const actions = Array.isArray(item.actions)
                    ? item.actions.filter((action: unknown): action is SecurityActionType => ["kick", "ban", "remove_role", "send_alert"].includes(String(action)))
                    : [];
                if (!item.event || typeof item.event !== "string") return null;
                if (!item.limit || typeof item.limit !== "number") return null;
                if (!item.windowMs || typeof item.windowMs !== "number") return null;
                return {
                    event: item.event as SecurityEventType,
                    limit: Math.max(1, Math.floor(item.limit)),
                    windowMs: Math.max(1000, Math.floor(item.windowMs)),
                    actions: actions.length > 0 ? actions : ["send_alert"],
                } as SecurityRule;
            })
            .filter((rule: SecurityRule | null): rule is SecurityRule => Boolean(rule))
        : [];

    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
        rules,
        whitelistUserIds: Array.isArray(raw.whitelistUserIds)
            ? raw.whitelistUserIds.filter((id: unknown): id is string => typeof id === "string")
            : [],
        whitelistRoleIds: Array.isArray(raw.whitelistRoleIds)
            ? raw.whitelistRoleIds.filter((id: unknown): id is string => typeof id === "string")
            : [],
        settings,
    };
}

// Export COMMON_EVENTS and persistAudit for use everywhere
export const COMMON_EVENTS: string[] = [
    "guildCreate",
    "guildDelete",
    "guildMemberAdd",
    "guildMemberRemove",
    "guildMemberUpdate",
    "guildBanAdd",
    "guildBanRemove",
    "channelCreate",
    "channelUpdate",
    "channelDelete",
    "roleCreate",
    "roleUpdate",
    "roleDelete",
    "emojiCreate",
    "emojiUpdate",
    "emojiDelete",
    "stickerCreate",
    "stickerUpdate",
    "stickerDelete",
    "threadCreate",
    "threadUpdate",
    "threadDelete",
    "threadMembersUpdate",
    "threadMemberUpdate",
    "messageUpdate",
    "messageDelete",
    "messageDeleteBulk",
    "messageReactionAdd",
    "messageReactionRemove",
    "messageReactionRemoveAll",
    "messageReactionRemoveEmoji",
    "webhooksUpdate",
    "inviteCreate",
    "inviteDelete",
    "typingStart",
    "voiceStateUpdate",
    "presenceUpdate",
    "interactionCreate",
    "stageInstanceCreate",
    "stageInstanceUpdate",
    "stageInstanceDelete",
    "guildScheduledEventCreate",
    "guildScheduledEventUpdate",
    "guildScheduledEventDelete",
    "guildScheduledEventUserAdd",
    "guildScheduledEventUserRemove",
    "autoModerationActionExecution",
    "autoModerationRuleCreate",
    "autoModerationRuleUpdate",
    "autoModerationRuleDelete",
    "guildAuditLogEntryCreate",
    "entitlementCreate",
    "entitlementUpdate",
    "entitlementDelete",
    "subscriptionCreate",
    "subscriptionUpdate",
    "subscriptionDelete",
];

// Dummy persistAudit for export (should be implemented in a shared util)
export async function persistAudit(params: {
    botName: string;
    eventName: string;
    source: string;
    args: unknown[];
    actorId?: string;
    targetId?: string;
    channelId?: string;
    messageId?: string;
}): Promise<void> {
    // Implement actual logging logic or import from shared util
}
