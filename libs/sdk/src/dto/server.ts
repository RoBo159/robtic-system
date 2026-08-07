import type { ServerIdentity } from "./common";
import type { StaffAction } from "../constants/staff-actions";

/** Lifecycle states a Minecraft server reports. Mirrors MINECRAFT_SERVER_STATES. */
export type ServerState = "ONLINE" | "OFFLINE" | "RESTARTING" | "CRASHED";

/** `POST /api/server/start`, `/stop`, `/status`, `/heartbeat` all share this body. */
export interface ServerReportRequest extends ServerIdentity {
    guildId: string;
    status: ServerState;
    onlinePlayers: number;
    maxPlayers: number;
    minecraftVersion: string;
    /** Server software banner, e.g. "Paper 1.21.4" or "Purpur 1.21.4". */
    software?: string;
    javaVersion?: string;
    tps?: number;
    memoryUsedMb?: number;
    memoryMaxMb?: number;
    cpuPercent?: number;
    uptimeMs?: number;
    world?: string;
}

/** `POST /api/server/playerJoin` and `/playerLeave`. */
export interface PlayerPresenceRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    requestId: string;
    /** Present on leave; used to accumulate play time and close a staff session. */
    sessionMs?: number;
}

/**
 * `POST /api/server/playerJoin` response — everything the join handler needs so it does not have
 * to make four more calls while the player is still loading in.
 */
export interface PlayerJoinResponse {
    linked: boolean;
    discordId: string | null;
    groups: string[];
    frozen: boolean;
    jailed: boolean;
    /** True when the player has history worth alerting online staff about. */
    hasHistory: boolean;
    warningCount: number;
    jailCount: number;
    reportCount: number;
    /** Set when a crash left an unrestored staff backup behind. */
    pendingStaffRestore: boolean;
}

/** `GET /api/server/info` — read by the bot's `!ip` / `!status` commands. */
export interface ServerInfoResponse {
    serverId: string;
    serverName: string;
    serverType: string | null;
    status: ServerState;
    address: string | null;
    port: number | null;
    onlinePlayers: number;
    maxPlayers: number;
    minecraftVersion: string | null;
    supportedVersions: string[];
    software: string | null;
    javaVersion: string | null;
    tps: number | null;
    memoryUsedMb: number | null;
    memoryMaxMb: number | null;
    cpuPercent: number | null;
    uptimeMs: number | null;
    world: string | null;
    lastHeartbeatAt: string | null;
    lastRestartAt: string | null;
}

/**
 * `GET /api/server/config` — the startup bundle. One call replaces the six separate downloads the
 * plugin would otherwise make, so a cold start is a single round trip.
 */
export interface ServerConfigBundleResponse {
    guildId: string;
    serverId: string;
    revision: string;
    prices: Array<{ itemKey: string; label: string; price: number; enabled: boolean }>;
    /** Discord role id → LuckPerms group, in configured precedence order. */
    roleMappings: Array<{ roleId: string; group: string; name: string; priority: number }>;
    lobbies: Array<{ id: string; name: string; world: string; x: number; y: number; z: number; yaw: number; pitch: number; permission: string | null }>;
    /** Channel and webhook targets, so the plugin never holds a Discord id in its own config. */
    logging: Partial<Record<StaffAction, string>>;
    baseStaffGroup: string;
    jailRoleId: string | null;
}

/** `GET /api/discord/pending` — replaces the plugin's direct poll of the bridge queue. */
export interface PendingEventsResponse {
    events: Array<{
        id: string;
        type: string;
        payload: Record<string, unknown>;
        createdAt: string;
    }>;
}
