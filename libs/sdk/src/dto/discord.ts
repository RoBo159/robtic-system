import type { ServerIdentity } from "./common";
import type { StaffAction } from "../constants/staff-actions";

/** `GET /api/discord/roles` — a linked member's current Discord roles, for display and audit. */
export interface DiscordRolesResponse {
    guildId: string;
    discordId: string;
    uuid: string;
    roleIds: string[];
    /** LuckPerms groups the player actually holds in game, as last reported by the server. */
    groups: string[];
    syncedAt: string;
}

/**
 * One player's LuckPerms groups, as observed on the game server.
 *
 * <h2>Direction</h2>
 *
 * Minecraft is the authority. The game server reads the player's LuckPerms groups locally — no API
 * call is involved in *resolving* them — and reports the concrete Discord outcome it wants: grant
 * these role ids, revoke those. The API performs the Discord write and nothing else; it holds no
 * copy of the group ladder and never derives a group from a Discord role.
 *
 * This is the reverse of the old design, where Discord computed a group delta and the plugin
 * applied it. Only one side writes now, so the two can no longer fight over the same state.
 */
export interface RoleSyncPlayer {
    uuid: string;
    username: string;
    /** LuckPerms groups held right now, lowercase. Sent for the audit trail and the projection. */
    groups: string[];
    /** Discord role ids to add, already resolved from `groups` by the server's roles.yml. */
    grantRoleIds: string[];
    /** Discord role ids to remove — only ever ones this configuration manages. */
    revokeRoleIds: string[];
}

/**
 * `POST /api/discord/sync-roles` — a batch of players whose groups changed.
 *
 * Batched on purpose: a restart or a `/robtic refresh` would otherwise fire one request per online
 * player. Players who are not linked are skipped by the API rather than rejected, because having no
 * Discord account is normal and is not an error the server can act on.
 */
export interface RoleSyncRequest extends ServerIdentity {
    guildId: string;
    players: RoleSyncPlayer[];
    requestId: string;
}

export interface RoleSyncResult {
    uuid: string;
    /** False when the player has not linked Discord — the only ordinary reason for a skip. */
    linked: boolean;
    granted: string[];
    revoked: string[];
    /** Set when Discord refused a specific write; the rest of the batch still applied. */
    error?: string;
}

export interface RoleSyncResponse {
    results: RoleSyncResult[];
}

/** `POST /api/discord/chat` — in-game chat, ordinary or staff-only. */
export interface DiscordChatRequest extends ServerIdentity {
    guildId: string;
    channel: "public" | "staff";
    uuid: string;
    username: string;
    message: string;
    /** Rank prefix rendered in the staff channel, e.g. "Admin". */
    rankName?: string;
    requestId: string;
}

/**
 * `POST /api/discord/log` — a structured moderation embed.
 *
 * The plugin never names a channel or a webhook: it names the action, and the API resolves the
 * destination from the guild's logging config. That is what keeps Discord ids out of the plugin.
 */
export interface DiscordLogRequest extends ServerIdentity {
    guildId: string;
    action: StaffAction;
    moderatorUuid?: string;
    moderatorUsername?: string;
    moderatorDiscordId?: string;
    targetUuid?: string;
    targetUsername?: string;
    targetDiscordId?: string;
    reason?: string;
    duration?: string;
    fields?: Record<string, string | number | boolean>;
    /** ISO timestamp of when the action happened, not when it was delivered. */
    occurredAt: string;
    requestId: string;
}

/** `POST /api/discord/status` — pushes a status-panel refresh. */
export interface DiscordStatusRequest extends ServerIdentity {
    guildId: string;
    requestId: string;
}
