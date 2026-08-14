/**
 * The bot owner — the one identity that bypasses every permission check, including the `admin`
 * command scope.
 *
 * Read from the environment rather than checked in, because this bot runs in servers its author
 * does not control: a committed owner id is a standing liability, and each deployment needs its
 * own. Unset resolves to the empty string, which no snowflake ever equals, so the checks below it
 * (super-user whitelist, guild operator, staff tiers) become the only way in — fail-closed.
 */
export const SUPER_ADMIN_ID = process.env.BOT_OWNER_ID?.trim() ?? "";
