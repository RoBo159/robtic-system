import type { Paged, ServerIdentity } from "./common";
import type { StaffAction, StaffStatKey } from "../constants/staff-actions";

/** A serialised snapshot of everything staff mode has to give back. */
export interface InventorySnapshot {
    /** Base64 of a Bukkit-serialised ItemStack[]; opaque to the API, which only stores it. */
    inventory: string;
    armor: string;
    offhand: string;
    enderChest?: string;
    xpLevel: number;
    xpProgress: number;
    food: number;
    health: number;
    heldSlot: number;
    location: WorldLocation;
}

export interface WorldLocation {
    world: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}

/** `POST /api/staff/enable` — opens a session and stores the backup in one atomic call. */
export interface StaffEnableRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    snapshot: InventorySnapshot;
    requestId: string;
}

export interface StaffEnableResponse {
    sessionId: string;
    /** LuckPerms group to apply for the duration of the session. */
    rankGroup: string;
    rankName: string;
    /** Group to return to when the session ends. */
    baseGroup: string;
    startedAt: string;
}

/** `POST /api/staff/disable` — closes the session and hands the backup back for restoration. */
export interface StaffDisableRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    requestId: string;
    /** Why the session ended, which is what distinguishes a clean exit from a crash recovery. */
    reason: "command" | "disconnect" | "shutdown" | "recovery";
}

export interface StaffDisableResponse {
    sessionId: string | null;
    /** Null when no backup was stored, which the plugin treats as "nothing to restore". */
    snapshot: InventorySnapshot | null;
    baseGroup: string;
    durationMs: number;
}

/** `GET /api/staff/backup` — crash recovery on join, when no session end was ever recorded. */
export interface StaffBackupResponse {
    exists: boolean;
    snapshot: InventorySnapshot | null;
    baseGroup: string;
}

/** `POST /api/staff/freeze` and `/unfreeze`. */
export interface FreezeRequest extends ServerIdentity {
    guildId: string;
    targetUuid: string;
    targetUsername: string;
    moderatorUuid: string;
    reason?: string;
    requestId: string;
}

export interface FreezeStateResponse {
    targetUuid: string;
    frozen: boolean;
    reason: string | null;
    moderatorUuid: string | null;
    since: string | null;
}

/** `POST /api/staff/jail`. */
export interface JailRequest extends ServerIdentity {
    guildId: string;
    targetUuid: string;
    targetUsername: string;
    moderatorUuid: string;
    /** Null for an indefinite jail. */
    durationMs: number | null;
    reason: string;
    requestId: string;
}

export interface JailStateResponse {
    targetUuid: string;
    jailed: boolean;
    reason: string | null;
    moderatorUuid: string | null;
    jailedAt: string | null;
    /** Null when indefinite. */
    releaseAt: string | null;
    remainingMs: number | null;
}

/** `POST /api/staff/unjail`. */
export interface UnjailRequest extends ServerIdentity {
    guildId: string;
    targetUuid: string;
    moderatorUuid: string;
    reason?: string;
    requestId: string;
}

/** `POST /api/staff/log` — the one write every audited action funnels through. */
export interface StaffLogRequest extends ServerIdentity {
    guildId: string;
    action: StaffAction;
    actorUuid?: string;
    actorUsername?: string;
    targetUuid?: string;
    targetUsername?: string;
    reason?: string;
    /** Human-readable duration for a timed action, e.g. "2h 30m". */
    duration?: string;
    /** Anything action-specific; rendered as extra embed fields. */
    metadata?: Record<string, string | number | boolean>;
    requestId: string;
}

/** `GET /api/staff/history` — jail and punishment history for one player. */
export interface JailHistoryEntry {
    reason: string;
    moderatorUsername: string;
    durationMs: number | null;
    jailedAt: string;
    releasedAt: string | null;
    releasedBy: string | null;
    serverId: string;
}

export type JailHistoryResponse = Paged<JailHistoryEntry>;

export interface WarningDto {
    id: string;
    reason: string;
    issuedByUuid: string;
    issuedByUsername: string;
    createdAt: string;
    serverId: string;
}

export interface NoteDto {
    id: string;
    text: string;
    authorUuid: string;
    authorUsername: string;
    createdAt: string;
    serverId: string;
}

export interface ReportDto {
    id: string;
    reporterUuid: string;
    reporterUsername: string;
    targetUuid: string;
    targetUsername: string;
    reason: string;
    status: "open" | "resolved" | "dismissed";
    resolvedByUuid: string | null;
    createdAt: string;
    serverId: string;
}

/** `POST /api/staff/notes`, `/warnings`, `/reports` share this envelope. */
export interface CreateEntryRequest extends ServerIdentity {
    guildId: string;
    targetUuid: string;
    targetUsername: string;
    authorUuid: string;
    authorUsername: string;
    text: string;
    requestId: string;
}

/** `GET /api/staff/player` — everything the player-management GUI renders in one round trip. */
export interface StaffPlayerResponse {
    uuid: string;
    username: string;
    discordId: string | null;
    discordUsername: string | null;
    frozen: boolean;
    jail: JailStateResponse;
    warnings: WarningDto[];
    notes: NoteDto[];
    reports: ReportDto[];
    jailHistory: JailHistoryEntry[];
    playTimeMs: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
}

/** `GET /api/staff/dashboard` — the `/staff` GUI. */
export interface StaffDashboardResponse {
    onlineStaff: Array<{ uuid: string; username: string; rankName: string; inStaffMode: boolean }>;
    playersOnline: number;
    frozenPlayers: Array<{ uuid: string; username: string }>;
    jailedPlayers: Array<{ uuid: string; username: string; remainingMs: number | null }>;
    pendingReports: ReportDto[];
    recentPunishments: JailHistoryEntry[];
}

/** `GET /api/staff/stats` — per-member analytics. */
export interface StaffStatsResponse {
    uuid: string;
    username: string;
    /** Total on-duty milliseconds across every recorded session. */
    onDutyMs: number;
    sessionCount: number;
    averageSessionMs: number;
    lastLoginAt: string | null;
    counters: Record<StaffStatKey, number>;
}

/** `GET /api/staff/leaderboard`. */
export type StaffLeaderboardResponse = Paged<StaffStatsResponse>;
