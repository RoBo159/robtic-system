/**
 * The feature's window onto shared domain logic.
 *
 * `@core/leaderboard` stays in libs rather than moving in here. It was shared with the Activity's
 * API, which is gone; it stays put because a leaderboard is domain logic rather than a feature's
 * private business, and any future surface would have to import it from libs anyway.
 */
export { TOP_CATEGORIES, type TopCategory } from "@constants";
export type { TopEntry } from "@typings/top";
export { getTopEntries, getStreakTopEntries } from "@core/leaderboard";
