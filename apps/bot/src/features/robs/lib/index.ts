/**
 * The feature's window onto shared domain logic.
 *
 * `@core/robs` stays in libs because the dashboard reads the same balance and libs can never
 * import apps.
 */
export { getRobsBalance, type RobsBalance } from "@core/robs";
