import type { ServerIdentity } from "./common";
import type { StaffAction } from "../constants/staff-actions";

/** `GET /api/discord/roles` — the projection that lets the plugin resolve staff rank offline. */
export interface DiscordRolesResponse {
    guildId: string;
    discordId: string;
    uuid: string;
    roleIds: string[];
    /** LuckPerms groups those roles map to, already resolved by the API. */
    groups: string[];
    syncedAt: string;
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
