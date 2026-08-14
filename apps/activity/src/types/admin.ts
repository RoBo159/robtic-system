export type AdminConfigSection = "server" | "xp" | "streak" | "combo" | "punish" | "logs" | "coins";

export interface AdminServerConfig {
    prefix: string | null;
    commandsChannelId: string | null;
    roles: { members: string | null; bots: string | null; en: string | null; ar: string | null };
    adminPanelRoles: string[];
}

export interface AdminXpConfig {
    chatChannels: string[];
    supportChannels: string[];
    staffChannels: string[];
    allowedRoles: string[];
    decayEnabled: boolean;
}

export interface AdminStreakConfig {
    channels: string[];
    remindersEnabled: boolean;
    minMessageLength: number;
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
    channels: Record<string, string | null>;
}

export interface AdminCoinsConfig {
    messagesPerCoin: number;
    comboPerCoin: number;
    streakRewards: { streak: number; coins: number }[];
}

export interface AdminConfigSnapshot {
    server: AdminServerConfig;
    xp: AdminXpConfig;
    streak: AdminStreakConfig;
    combo: AdminComboConfig;
    punish: AdminPunishConfig;
    logs: AdminLogsConfig;
    coins: AdminCoinsConfig;
}

export interface GuildChannelInfo {
    id: string;
    name: string;
    type: number;
    parentId: string | null;
    position: number;
}

export interface GuildRoleInfo {
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
}

export interface AdminBootstrap {
    isAdmin: boolean;
    /** Whitelisted bot owner — unlocks the bot admin panel. */
    isSuperUser: boolean;
    /** True when the Activity was opened inside the configured dev server (unlocks Projects). */
    isDevGuild: boolean;
    config?: AdminConfigSnapshot;
    channels?: GuildChannelInfo[];
    roles?: GuildRoleInfo[];
}

/** Bot-wide settings, super users only. */
export interface BotAdminConfig {
    isSuperUser: boolean;
    devGuildId?: string | null;
}
