import type { ServerIdentity } from "./common";

/** `POST /api/plugin/auth` — the plugin's startup handshake. */
export interface PluginAuthRequest extends ServerIdentity {
    guildId: string;
}

export interface PluginAuthResponse {
    guildId: string;
    serverId: string;
    /** Scopes the key carries, so the plugin can disable a feature it may not use. */
    scopes: string[];
    /** Server clock, so the plugin can detect a large skew against its own. */
    serverTime: string;
    apiVersion: string;
}

/** `POST /api/minecraft/link` — the plugin asks for a one-time code on a player's behalf. */
export interface IssueLinkCodeRequest {
    guildId: string;
    uuid: string;
    username: string;
    serverId: string;
}

export interface IssueLinkCodeResponse {
    code: string;
    expiresAt: string;
    minutesValid: number;
}

/** `POST /api/minecraft/verify` — redeems a code, called by the bot when a player runs the slash command. */
export interface VerifyLinkRequest {
    guildId: string;
    code: string;
    discordId: string;
}

export interface VerifyLinkResponse {
    linked: true;
    uuid: string;
    username: string;
    discordId: string;
}

/** `GET /api/minecraft/player` — the plugin's single read for everything it needs about a player. */
export interface MinecraftPlayerResponse {
    uuid: string;
    username: string;
    linked: boolean;
    discordId: string | null;
    discordUsername: string | null;
    /** Discord role ids the member currently holds; empty when unlinked. */
    roleIds: string[];
    /** LuckPerms groups Discord maps those roles to. */
    groups: string[];
    /** Highest configured staff rank, or null when the player is not staff. */
    staffRank: StaffRankSummary | null;
    frozen: boolean;
    jailed: boolean;
    warningCount: number;
    noteCount: number;
    /** Milliseconds of tracked play time across every server in the guild. */
    playTimeMs: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
}

/** One configured staff rank, resolved from a Discord role. */
export interface StaffRankSummary {
    /** Discord role id that granted it. */
    roleId: string;
    /** Display name from roles.yml. */
    name: string;
    /** LuckPerms group applied while in staff mode. */
    group: string;
    /** Position in the configured list; lower is higher-ranked. */
    priority: number;
}

/** `POST /api/minecraft/unlink`. */
export interface UnlinkRequest {
    guildId: string;
    uuid?: string;
    discordId?: string;
    /** Audit reason recorded on the log entry. */
    reason: string;
}
