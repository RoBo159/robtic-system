/**
 * The feature's window onto shared domain logic.
 *
 * `@core/coins` stays in libs: the Minecraft economy service in apps/minecraft-api moves the same
 * balance, and libs can never import apps.
 */
export { getCoinSummary, type CoinSummary } from "@core/coins";
