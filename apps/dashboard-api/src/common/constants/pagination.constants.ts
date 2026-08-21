/** How many rows a list endpoint returns when the caller does not say. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * The ceiling, whatever the caller asks for.
 *
 * These are unbounded `find()` queries over collections that grow with every moderation action, so
 * the cap is what stops one request reading a guild's entire history into memory.
 */
export const MAX_PAGE_SIZE = 200;
