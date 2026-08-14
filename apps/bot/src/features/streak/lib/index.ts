/**
 * The feature's window onto shared domain logic.
 *
 * `@core/streak` stays in libs rather than moving in here: `commands/profile.ts` and
 * `components/profile-menu.ts` both read `getStreakSummary`, and neither belongs to this feature.
 * Libs can never import apps, so the domain has to sit below both — which is also what lets this
 * folder be deleted without touching them.
 */
export {
    isClaimable,
    isStreakExpired,
    nextClaimAt,
    streakExpiresAt,
    getStreakSummary,
    type StreakSummary,
} from "@core/streak";
