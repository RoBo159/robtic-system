/**
 * Discord's own hard limits, as opposed to anything this bot chose.
 *
 * These lived in the projects feature's constants until that feature was deleted, which is exactly
 * why they are here now: a platform limit belongs to the platform, not to whichever system happened
 * to need it first.
 */

/** Options one select menu may carry. */
export const SELECT_MENU_MAX_OPTIONS = 25;

/** Characters in one select-menu option label. */
export const SELECT_MENU_LABEL_MAX_LENGTH = 100;
