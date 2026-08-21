export const DISCORD_API_BASE = "https://discord.com/api/v10";

export const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";

/**
 * The only scopes this dashboard asks for: who you are, and which servers you are in.
 *
 * Notably not `guilds.members.read` — the visitor's permissions in a guild come from the guild list
 * itself, and not `bot`, which would make this an install flow rather than a sign-in.
 */
export const DISCORD_OAUTH_SCOPES = "identify guilds";

/** Discord's own permission bits for "can manage this server". */
export const PERMISSION_MANAGE_GUILD = 1n << 5n;
export const PERMISSION_ADMINISTRATOR = 1n << 3n;

/** Guild lists are re-read on every dashboard page load and Discord rate-limits that endpoint hard. */
export const USER_GUILD_CACHE_MS = 30_000;

/** The bot's own guild list changes rarely and is shared by every visitor. */
export const BOT_GUILD_CACHE_MS = 60_000;
