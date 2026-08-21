/**
 * A Discord snowflake, as a string of digits.
 *
 * Bounded at both ends: snowflakes are currently 17-19 digits, and the range here leaves room either
 * side without admitting something that is plainly not an id. Used by `@IsDiscordId()` and by every
 * DTO that accepts a role or channel from the browser.
 */
export const DISCORD_ID_PATTERN = /^\d{15,25}$/;
