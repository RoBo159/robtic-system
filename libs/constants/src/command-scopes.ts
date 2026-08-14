/**
 * Where a command's data lives, and therefore where it registers.
 *
 * - `global` — data is shared across every server the bot is in.
 * - `guild`  — data belongs to one server.
 * - `admin`  — bot-level operator tooling. Registers only to the configured admin guild
 *              (see `!admin-guild`) and is hard-gated to super users, above every other bypass.
 */
export const COMMAND_SCOPES = ["global", "guild", "admin"] as const;

export type CommandScope = typeof COMMAND_SCOPES[number];

/**
 * Who may run a `guild`-scoped command.
 *
 * - `admin`   — server Administrators, the guild owner, or a role in `ServerConfig.botAdminRoles`.
 * - `general` — any member.
 * - `games`   — game-related, any member. Distinct from `general` only for grouping.
 *
 * Only `admin` gates anything. `general` and `games` are labels, so leaving `access` off an
 * untagged command cannot change who is able to run it.
 */
export const GUILD_ACCESS_LEVELS = ["admin", "general", "games"] as const;

export type GuildAccessLevel = typeof GUILD_ACCESS_LEVELS[number];

/** Applied when a command omits them, chosen so an untagged command behaves as it did before scopes existed. */
export const DEFAULT_COMMAND_SCOPE: CommandScope = "guild";
export const DEFAULT_GUILD_ACCESS: GuildAccessLevel = "general";

/** True when the command may only be published to the admin guild. */
export function isAdminScoped(scope: CommandScope | undefined): boolean {
    return scope === "admin";
}
