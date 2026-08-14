/**
 * The feature's window onto shared domain logic.
 *
 * `@core/coins` stays in libs rather than moving in here: `events/message-stats.ts`,
 * `services/combo/` and `commands/profile.ts` all award coins, and none of them belong to this
 * feature. Libs can never import apps, so the domain has to sit below both.
 */
export {
    getCoinSummary,
    getCoinRates,
    type CoinSummary,
    type CoinRates,
} from "@core/coins";
