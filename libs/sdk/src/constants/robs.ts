/**
 * What a rob is: a decimal amount with two places, and the rounding that keeps it one.
 *
 * <h2>Why robs stopped being whole numbers</h2>
 *
 * Every payout that did not land on a whole number was floored. That is invisible for an ore sale
 * worth 240 robs and ruinous for anything paid by the minute: five minutes of AFK at ten robs an
 * hour is 0.83, which floored to nothing — so a player stood still, came back, and watched their
 * balance not move.
 *
 * <h2>Why this lives in the SDK</h2>
 *
 * The SDK is the shared contract, and it deliberately depends on nothing. The validator that guards
 * every incoming amount lives here, so the scale has to as well; `@constants` re-exports it rather
 * than declaring a second copy, because two definitions of how money rounds is exactly the kind of
 * disagreement that shows up months later as a balance nobody can reproduce.
 *
 * The game server holds the same rule in `org.robtic.minecraft.util.Robs`. That one is a genuine
 * second implementation — a JVM cannot import TypeScript — so the two are kept deliberately trivial
 * and identical: two decimal places, half-up.
 *
 * <h2>Storage</h2>
 *
 * Mongo already stores robs as a `Number`, which is a double, so nothing needed migrating for this.
 * What needed fixing was the code on either side of it insisting on integers.
 */

/** Decimal places a rob is expressed to. */
export const ROBS_SCALE = 2;

/** Hundredths per rob. Every rounding in the economy goes through this factor. */
const ROBS_MINOR_UNITS = 10 ** ROBS_SCALE;

/**
 * Rounds an amount of robs to the storable scale, half-up.
 *
 * Half-up because it is the rule a player applies in their head, and a currency that rounds in a way
 * its users would not is one they think is broken. Applied at every boundary — request in, balance
 * out — so floating-point drift stays bounded at half a hundredth rather than growing with the
 * number of transactions.
 */
export function roundRobs(amount: number): number {
    if (!Number.isFinite(amount)) return 0;

    // The epsilon nudge is what makes 1.005 round to 1.01 rather than 1.00. Binary floating point
    // stores that value a hair *below* the decimal it prints as, so a naive scale-and-round breaks
    // the half-up promise on precisely the inputs a player is most likely to check by hand.
    return Math.round((amount + Number.EPSILON) * ROBS_MINOR_UNITS) / ROBS_MINOR_UNITS;
}

/** Whether an amount is a legal rob value: finite, non-negative, and no finer than the scale. */
export function isValidRobs(amount: number): boolean {
    return Number.isFinite(amount) && amount >= 0 && roundRobs(amount) === amount;
}

/**
 * Formats an amount for display: grouped, up to two decimals, no trailing zeros.
 *
 * A whole amount therefore reads exactly as it always did — `1,240` rather than `1,240.00` — so
 * making the currency decimal did not make every existing message noisier for the overwhelming
 * majority of amounts that are still whole.
 */
export function formatRobs(amount: number): string {
    return roundRobs(amount).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: ROBS_SCALE,
    });
}
