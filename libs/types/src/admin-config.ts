import type { ADMIN_CONFIG_SECTIONS } from "@constants/admin-config";

/** Which bot subsystem a config write targets. Derived from the constant so the two cannot drift. */
export type AdminConfigSection = typeof ADMIN_CONFIG_SECTIONS[number];

export interface AdminServerConfig {
    prefix: string | null;
    commandsChannelId: string | null;
    roles: {
        members: string | null;
        bots: string | null;
        en: string | null;
        ar: string | null;
    };
    /** Roles allowed into the Activity's guild admin panel (besides owner/Administrator). */
    adminPanelRoles: string[];
    /** Roles that pass `access: "admin"` commands in chat. Distinct from adminPanelRoles. */
    botAdminRoles: string[];
}

export interface AdminXpConfig {
    chatChannels: string[];
    supportChannels: string[];
    staffChannels: string[];
    allowedRoles: string[];
    decayEnabled: boolean;
    /** Where level-ups are announced. Null means they are not announced. */
    levelUpChannelId: string | null;
}

export interface AdminStreakConfig {
    channels: string[];
    remindersEnabled: boolean;
    minMessageLength: number;
    /** Where milestones are announced. Null falls back to replying in the channel that earned it. */
    announceChannelId: string | null;
}

export interface AdminComboConfig {
    championRoleId: string | null;
    minScorePerMessage: number | null;
    maxScorePerMessage: number | null;
}

export interface AdminPunishConfig {
    pointsPerAction: number;
    proofChannelId: string | null;
    shortcutRoleIds: string[];
}

export interface AdminLogsConfig {
    /** Log-registry key → channel id (or null when unset). */
    channels: Record<string, string | null>;
}

export interface AdminPointsConfig {
    /** Real messages needed per earned point. */
    messagesPerPoint: number;
    /** Combo score needed per earned point. */
    comboPerPoint: number;
    /** Minutes of active voice needed per earned point. */
    voiceMinutesPerPoint: number;
    /** Streak day-counts that pay out when reached. */
    streakRewards: { streak: number; points: number }[];
    /** Points needed for one RC. */
    pointsPerRc: number;
    conversionEnabled: boolean;
    minConversionPoints: number;
}

export interface AdminVoiceConfig {
    enabled: boolean;
    /** Empty means every voice channel. */
    trackedChannelIds: string[];
    excludedChannelIds: string[];
    /** Empty means everyone. */
    allowedRoleIds: string[];
    /** Share of the reward when alone, 0-1. */
    aloneMultiplier: number;
    afkTimeoutMinutes: number;
    minMembersForFullRate: number;
}

/** One feature as the panel sees it: what it is, and whether it is on in this guild. */
export interface AdminFeatureEntry {
    key: string;
    description: string;
    activation: "opt-in" | "default-on";
    /** Commands the feature owns, for display. */
    commands: string[];
    /** Effective state here: the guild's choice, or the activation default when it has made none. */
    enabled: boolean;
    /** True when the guild has explicitly chosen, rather than inheriting the default. */
    overridden: boolean;
}

export interface AdminFeaturesConfig {
    features: AdminFeatureEntry[];
}

/** Only the toggles are writable — the catalog is published by the bot, not edited here. */
export interface AdminFeaturesUpdate {
    /** Feature key → desired state. */
    states: Record<string, boolean>;
}

export interface AdminRejoinRolesConfig {
    excludedRoleIds: string[];
    staffRoleIds: string[];
    retentionHours: number;
    /** Always less than retentionHours — rejected otherwise. */
    staffRetentionHours: number;
}

/** The full editable config surface for one guild. */
export interface AdminConfigSnapshot {
    server: AdminServerConfig;
    xp: AdminXpConfig;
    streak: AdminStreakConfig;
    combo: AdminComboConfig;
    punish: AdminPunishConfig;
    logs: AdminLogsConfig;
    points: AdminPointsConfig;
    voice: AdminVoiceConfig;
    features: AdminFeaturesConfig;
    rejoinRoles: AdminRejoinRolesConfig;
}

/** Per-section payload shapes for a config write. */
export interface AdminConfigUpdate {
    server: AdminServerConfig;
    xp: AdminXpConfig;
    streak: AdminStreakConfig;
    combo: AdminComboConfig;
    punish: AdminPunishConfig;
    logs: AdminLogsConfig;
    points: AdminPointsConfig;
    voice: AdminVoiceConfig;
    features: AdminFeaturesUpdate;
    rejoinRoles: AdminRejoinRolesConfig;
}
