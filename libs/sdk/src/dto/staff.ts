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

/**
 * Where a player was standing when a report was filed.
 *
 * Captured at filing time on both sides, not resolved when the report is read: by the time staff
 * open it the reporter has walked away and the reported player is often offline, so a position
 * looked up on read would answer a question nobody asked.
 */
export interface ReportLocationDto {
    world: string;
    x: number;
    y: number;
    z: number;
    serverId: string | null;
    recordedAt: string | null;
}

/**
 * `open` → `reviewing` while a staff member holds it → `accepted` or `refused`.
 *
 * `resolved` and `dismissed` are the older closing statuses and are still returned for reports
 * closed before accept/refuse existed.
 */
export type ReportStatus = "open" | "reviewing" | "accepted" | "refused" | "resolved" | "dismissed";

export interface ReportDto {
    id: string;
    /** Six digits, unique per guild. The identifier staff type and every embed prints. */
    code: string;
    reporterUuid: string;
    reporterUsername: string;
    /** Null when the reporter has not linked Discord, which never blocks a report. */
    reporterDiscordId: string | null;
    reporterLocation: ReportLocationDto | null;
    targetUuid: string;
    targetUsername: string;
    targetDiscordId: string | null;
    targetLocation: ReportLocationDto | null;
    /** Whether the reported player was online when the report was filed. */
    targetOnline: boolean;
    reason: string;
    status: ReportStatus;
    /** Set while the status is `reviewing`. */
    assignedToUuid: string | null;
    assignedToUsername: string | null;
    resolvedByUuid: string | null;
    resolvedByUsername: string | null;
    /** True when accepting the report opened a jail sentence. */
    jailApplied: boolean;
    createdAt: string;
    serverId: string;
}

/** `POST /api/staff/notes` and `/warnings` share this envelope. */
export interface CreateEntryRequest extends ServerIdentity {
    guildId: string;
    targetUuid: string;
    targetUsername: string;
    authorUuid: string;
    authorUsername: string;
    text: string;
    requestId: string;
}

/**
 * `POST /api/staff/reports` — filing a report.
 *
 * Extends the shared entry envelope with the two positions and the "was the reported player here?"
 * flag, all of which are only meaningful at the moment of filing.
 */
export interface FileReportRequest extends CreateEntryRequest {
    reporterLocation?: Omit<ReportLocationDto, "serverId" | "recordedAt">;
    targetLocation?: Omit<ReportLocationDto, "serverId" | "recordedAt">;
    targetOnline?: boolean;
}

/**
 * `POST /api/staff/reports/decide` — accepting or refusing a report.
 *
 * Accepting jails the reported player. That happens here rather than in the plugin because the
 * reported player is frequently offline: a jail applied to a live `Player` object would silently do
 * nothing, while a sentence written here is re-read and enforced the next time they join.
 */
export interface DecideReportRequest extends ServerIdentity {
    guildId: string;
    /** The six-digit code, or the report's id. Either resolves. */
    reportId: string;
    decision: "accept" | "refuse";
    staffUuid: string;
    staffUsername: string;
    /** Null or absent for an indefinite jail. Ignored when refusing. */
    jailDurationMs?: number | null;
    /** Overrides the report's own text as the jail reason. */
    note?: string;
    requestId: string;
}

export interface DecideReportResponse {
    report: ReportDto;
    /** False when the decision was to refuse, or when the player was already serving a sentence. */
    jailed: boolean;
    /** Why no jail was opened, when one was expected. Null on success. */
    jailSkippedReason: string | null;
    /** Mail posted as a result: to the reporter always, to the reported player when jailed. */
    mailSent: number;
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

/** `POST /api/staff/reports/claim` — atomic; only the first caller succeeds. */
export interface ClaimReportRequest extends ServerIdentity {
    guildId: string;
    reportId: string;
    staffUuid: string;
    staffUsername: string;
    requestId: string;
}

/** `POST /api/staff/reports/close`. */
export interface CloseReportRequest extends ServerIdentity {
    guildId: string;
    reportId: string;
    staffUuid: string;
    staffUsername: string;
    status: "resolved" | "dismissed";
    note?: string;
    requestId: string;
}

/** `GET /api/staff/reports/counts` — everything the report placeholders need, in one read. */
export interface ReportCountsResponse {
    open: number;
    reviewing: number;
    accepted: number;
    refused: number;
    resolved: number;
    dismissed: number;
    /** Reports the querying staff member currently holds. */
    claimedByStaff: number;
    /** Reports they have closed, ever. */
    handledByStaff: number;
}

/** The roster changes `/addstaff`, `/promotestaff`, `/demotestaff`, `/setstaffrole` and `/firestaff` make. */
export type StaffManagementAction = "add" | "promote" | "demote" | "set-role" | "fire";

/**
 * `POST /api/staff/manage`.
 *
 * The game server has already applied the LuckPerms group — that is what a rank *is* — and sends
 * the outcome here to be audited and mirrored onto Discord. The API holds no copy of the ladder.
 */
export interface ManageStaffRequest extends ServerIdentity {
    guildId: string;
    action: StaffManagementAction;
    actorUuid: string;
    actorUsername: string;
    targetUuid: string;
    targetUsername: string;
    /** Rank names for the audit line; null where the action has no before or after. */
    fromRank?: string | null;
    toRank?: string | null;
    /** Discord roles to mirror. Absent when a rank has no role configured. */
    grantRoleId?: string;
    revokeRoleIds?: string[];
    requestId: string;
}

export interface ManageStaffResponse {
    action: StaffManagementAction;
    targetUuid: string;
    /** Null when the target has not linked Discord, which no longer blocks the change. */
    discordId: string | null;
    fromRank: string | null;
    toRank: string | null;
}
