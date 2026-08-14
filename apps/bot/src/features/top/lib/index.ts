/**
 * The feature's window onto shared domain logic.
 *
 * `@core/leaderboard` stays in libs rather than moving in here: `apps/api/src/routes/get-leaderboard.ts`
 * reads it too, and libs can never import apps.
 */
export { TOP_CATEGORIES, type TopCategory } from "@constants";
export type { TopEntry } from "@typings/top";
export { getTopEntries, getStreakTopEntries } from "@core/leaderboard";
