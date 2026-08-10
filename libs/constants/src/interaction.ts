/** How long a bot error reply stays visible before auto-deletion. */
export const ERROR_REPLY_LIFETIME_MS = 3_000;

/** Discord's hard cap on an embed description, used to truncate generated lists before sending. */
export const EMBED_DESCRIPTION_LIMIT = 4096;

/** Cooldown applied to commands that don't declare their own, in seconds. */
export const DEFAULT_COMMAND_COOLDOWN_SECONDS = 5;
