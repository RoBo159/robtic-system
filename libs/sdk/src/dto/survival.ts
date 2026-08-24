import type { ServerIdentity } from "./common";

/**
 * The survival-quality-of-life contract: spawn, homes, friends, chests, cosmetics and `/back`.
 *
 * <h2>Everything here is addressed by Minecraft UUID</h2>
 *
 * Homes, friends and locked chests are Minecraft concepts. Keying them by UUID — as robs already
 * are — is what lets them work for a player who has never linked Discord, and removes a link
 * lookup from every call. Only the premium tier depends on Discord, because premium is bought
 * there; that resolution happens inside the API, not in the caller.
 *
 * <h2>Responses carry the whole cache entry</h2>
 *
 * The plugin is cache-first: it must not ask again to find out how much budget is left or what the
 * limit is. So a mutation returns the state *after* it, and a budget returns its reset time — that
 * is what lets the plugin decrement locally and only come back when the window has genuinely
 * elapsed.
 */

/** A point in a world. Matches the plugin's `Location` minus the world object itself. */
export interface WorldLocationDto {
    world: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}

// ─── Spawn ────────────────────────────────────────────────────────────────────────────────────

/** `GET /api/survival/spawn` — null when no spawn has been set on this server yet. */
export interface SpawnResponse {
    serverId: string;
    location: WorldLocationDto | null;
    updatedAt: string | null;
}

/** `POST /api/survival/spawn` — `/setspawn`. */
export interface SetSpawnRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    location: WorldLocationDto;
    requestId: string;
}

// ─── Homes ────────────────────────────────────────────────────────────────────────────────────

export interface HomeDto {
    name: string;
    location: WorldLocationDto;
    createdAt: string;
}

/**
 * `GET /api/survival/homes` — the whole set, plus the limit that applies right now.
 *
 * The limit travels with the list so the plugin can render "3/5" and refuse a fourth `/sethome`
 * without a second call to work out what the player's tier allows.
 */
export interface HomeListResponse {
    uuid: string;
    serverId: string;
    homes: HomeDto[];
    limit: number;
    /** Tier the limit came from, for the message shown when the limit is hit. */
    tierName: string | null;
}

export interface SetHomeRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    name: string;
    location: WorldLocationDto;
    requestId: string;
}

export interface DeleteHomeRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    name: string;
    requestId: string;
}

export interface RenameHomeRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    from: string;
    to: string;
    requestId: string;
}

// ─── Friends ──────────────────────────────────────────────────────────────────────────────────

export interface FriendDto {
    uuid: string;
    username: string;
    /** Resolved from the server's own online list at render time, never stored. */
    online: boolean;
    premiumTier: string | null;
    lastSeenAt: string | null;
}

export interface FriendRequestDto {
    uuid: string;
    username: string;
    createdAt: string;
}

/** `GET /api/survival/friends` — the list, the pending requests and the player's own settings. */
export interface FriendListResponse {
    uuid: string;
    friends: FriendDto[];
    incoming: FriendRequestDto[];
    outgoing: FriendRequestDto[];
    /** True when `/friend tp` may teleport somebody in without asking this player first. */
    autoAcceptTp: boolean;
}

/** The verbs `/friend` supports that change state. */
export type FriendAction = "add" | "accept" | "deny" | "remove" | "cancel";

export interface FriendActionRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    action: FriendAction;
    targetUuid: string;
    targetUsername: string;
    requestId: string;
}

export interface FriendActionResponse {
    action: FriendAction;
    /** What the action produced, so the plugin can pick the right message without re-reading. */
    outcome: "requested" | "accepted" | "denied" | "removed" | "cancelled" | "already-friends" | "no-request";
    friendCount: number;
}

// ─── Back ─────────────────────────────────────────────────────────────────────────────────────

/**
 * `GET /api/survival/back` and `POST /api/survival/back/spend`.
 *
 * `resetAt` is what makes the plugin's local decrement safe: once the cached `remaining` hits zero
 * the plugin refuses until this time passes, and only then asks again.
 */
export interface BackBudgetResponse {
    uuid: string;
    remaining: number;
    limit: number;
    resetAt: string;
    /** False when the player's tier has no `/back` at all, which is a different message. */
    allowed: boolean;
}

export interface SpendBackRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    requestId: string;
}

// ─── Chests ───────────────────────────────────────────────────────────────────────────────────

export interface LockedChestDto {
    location: WorldLocationDto;
    createdAt: string;
}

export interface LockedChestListResponse {
    uuid: string;
    serverId: string;
    chests: LockedChestDto[];
    limit: number;
}

export interface ChestLockRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    location: WorldLocationDto;
    requestId: string;
}

export interface ChestLockResponse {
    /** False when the tier limit is already reached, or when somebody else owns the chest. */
    applied: boolean;
    reason: "ok" | "limit-reached" | "owned-by-other" | "not-locked" | "not-premium";
    count: number;
    limit: number;
    /** Present when the chest is locked by somebody else. */
    ownerUsername?: string;
}

/** `GET /api/survival/chest` — the Tier II linked chest, or null when none is linked. */
export interface PortableChestResponse {
    uuid: string;
    serverId: string;
    location: WorldLocationDto | null;
}

export interface LinkChestRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    location: WorldLocationDto;
    requestId: string;
}

// ─── Player settings ──────────────────────────────────────────────────────────────────────────

/**
 * `GET /api/survival/settings` — every preference a player owns.
 *
 * One shape rather than one per feature: the plugin reads all of it once on join and caches it for
 * the session, so splitting it would only mean more requests to populate the same cache.
 */
export interface PlayerSettingsResponse {
    uuid: string;

    /** Whether friends may teleport in without asking. Default false — manual approval. */
    friendTpAutoAccept: boolean;
    /** Whether other players are rendered in the lobby for this player (`/players`). */
    playersVisible: boolean;
    /** Whether this player's profile is hidden from other players' lobby menus. */
    privateProfile: boolean;

    joinMessage: string | null;
    leaveMessage: string | null;
    particle: string | null;

    /**
     * Whether the premium-only settings may be changed.
     *
     * The free settings — visibility, friend teleports, private profile — are always changeable;
     * this gates the cosmetics only, and the plugin greys those rows out rather than failing them.
     */
    cosmeticsAllowed: boolean;
}

/** `POST /api/survival/settings/set`. Omitted keys are left alone; an explicit null clears. */
export interface SetPlayerSettingsRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    friendTpAutoAccept?: boolean;
    playersVisible?: boolean;
    privateProfile?: boolean;
    joinMessage?: string | null;
    leaveMessage?: string | null;
    particle?: string | null;
    requestId: string;
}

// ─── Survival inventory preview ───────────────────────────────────────────────────────────────

/**
 * `GET /api/survival/inventory-snapshot` — the lobby's read-only preview.
 *
 * Null when nothing has been captured yet, which is an ordinary state for somebody who has not
 * played survival since the feature was installed. `capturedAt` lets the menu say how old it is
 * rather than implying it is live.
 */
export interface InventorySnapshotResponse {
    uuid: string;
    world: string | null;
    contents: string;
    armor: string;
    offhand: string;
    capturedAt: string | null;
}

/** `POST /api/survival/inventory-snapshot` — captured as the player leaves a survival world. */
export interface PutInventorySnapshotRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    world: string;
    contents: string;
    armor: string;
    offhand: string;
    requestId: string;
}

// ─── Premium and profile ──────────────────────────────────────────────────────────────────────

/** What a player's tier entitles them to. Every limit in the plugin comes from here. */
export interface PremiumEntitlements {
    tierId: string | null;
    tierName: string | null;
    level: number;
    homeLimit: number;
    backUses: number;
    lockedChestLimit: number;
    portableChest: boolean;
    cosmetics: boolean;
    /** LuckPerms group the tier grants in game, or null for a free player. */
    luckPermsGroup: string | null;
}

/**
 * `GET /api/survival/profile` — everything `/profile` and `/minecraft profile` render.
 *
 * One aggregate rather than six calls: both consumers need the whole picture at once, and six
 * round trips would be six chances to show a half-consistent view.
 *
 * Home *coordinates* are deliberately absent — only the count and the limit. The Discord profile
 * must never be able to reveal where somebody lives.
 */
export interface SurvivalProfileResponse {
    uuid: string;
    username: string;
    online: boolean;
    discordId: string | null;
    linked: boolean;
    premium: PremiumEntitlements;
    playtimeMs: number;
    firstJoinAt: string | null;
    lastSeenAt: string | null;
    robs: number;
    kills: number;
    deaths: number;
    jailed: boolean;
    /** Milliseconds left to serve, or null for a permanent sentence or none at all. */
    jailRemainingMs: number | null;
    jailCount: number;
    homesUsed: number;
    homeLimit: number;
    friendCount: number;
    /** Staff rank display name as last reported by a game server, or null. */
    rankName: string | null;
    /** Time spent in an AFK world, and what it earned. Carried so the profile needs no second read. */
    afk: AfkStatisticsDto;
}

/**
 * A player's AFK totals.
 *
 * Lifetime figures only — the session a player is in right now is held in the game server's memory
 * and is never written here, because it is worth a database round trip only once, when it ends.
 */
export interface AfkStatisticsDto {
    /** Lifetime time spent in an AFK world, in milliseconds. */
    totalMs: number;
    /** The same figure for `todayDate` alone. */
    todayMs: number;
    /** The UTC day `todayMs` belongs to, `yyyy-MM-dd`, so a stale figure is recognisable as stale. */
    todayDate: string;
    /** Lifetime robs earned by being AFK. Already included in the player's balance. */
    robs: number;
}

/**
 * `POST /api/survival/afk` — one finished AFK session, reported as a delta.
 *
 * Sent once, when the session ends. `robs` is what the game server calculated from its own start
 * timestamp and configured rate; the API credits exactly that and does not recompute it, because
 * the rate is the game server's setting and only it knows when the session actually began.
 */
export interface ReportAfkSessionRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    /** How long the session lasted, in milliseconds. */
    afkMs: number;
    /** Whole robs the session earned. Zero is ordinary — a short session earns less than one. */
    robs: number;
    requestId: string;
}

/** `POST /api/survival/afk` — the totals after the session, so the game server can reconcile. */
export interface ReportAfkSessionResponse {
    uuid: string;
    afk: AfkStatisticsDto;
    /** The balance after the credit, authoritative, for the plugin's balance cache. */
    balance: number;
}

/** `POST /api/survival/stats` — a session's activity, reported as deltas. */
export interface ReportStatsRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    playtimeMs?: number;
    kills?: number;
    deaths?: number;
    requestId: string;
}
