import type { DiscordChannel, DiscordRole } from "../../auth/interfaces";

/**
 * `GET /guilds/:guildId/directory` — the roles and channels every settings screen's pickers need.
 *
 * Served from here rather than fetched by the browser because reading them needs the bot token,
 * which must never reach a page script.
 */
export interface GuildDirectoryResponse {
    roles: DiscordRole[];
    channels: DiscordChannel[];
}
