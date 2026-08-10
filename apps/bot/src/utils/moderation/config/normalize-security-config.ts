import type {
    ModerationAuditSettings,
    ModerationSecurityConfig,
    SecurityActionType,
    SecurityEventType,
    SecurityRule,
} from "@typings/moderation-security";
import { SECURITY_ACTION_TYPES, MIN_SECURITY_WINDOW_MS } from "@constants";

/** Validates and repairs a stored security config, returning undefined when it isn't salvageable. */
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
                    ? item.actions.filter((action: unknown): action is SecurityActionType =>
                        SECURITY_ACTION_TYPES.includes(String(action) as SecurityActionType))
                    : [];
                if (!item.event || typeof item.event !== "string") return null;
                if (!item.limit || typeof item.limit !== "number") return null;
                if (!item.windowMs || typeof item.windowMs !== "number") return null;
                return {
                    event: item.event as SecurityEventType,
                    limit: Math.max(1, Math.floor(item.limit)),
                    windowMs: Math.max(MIN_SECURITY_WINDOW_MS, Math.floor(item.windowMs)),
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
