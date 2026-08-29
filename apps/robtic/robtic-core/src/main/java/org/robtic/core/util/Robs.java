package org.robtic.core.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;
import java.util.Optional;

/**
 * What a rob is: a decimal amount with two places, and the arithmetic that keeps it one.
 *
 * <h2>Why robs stopped being whole numbers</h2>
 *
 * They were {@code long}, and every payout that did not land on a whole number was floored. That is
 * invisible for an ore sale worth 240 robs and ruinous for anything that pays by the minute: five
 * minutes of AFK at ten robs an hour is 0.83, which floored to nothing, so a player stood still,
 * came back, and saw their balance unchanged. The AFK service carried the leftover fraction forward
 * to compensate, which worked within a session and lost the residue on every restart — a workaround
 * for a currency that could not express what the server was trying to pay.
 *
 * <h2>Two decimal places, and the rounding happens here</h2>
 *
 * Every amount that crosses a boundary — into the API, into a balance, onto a screen — passes
 * through {@link #round}. That is not decoration: {@code double} cannot represent 0.1, so a balance
 * built from thousands of {@code +0.1} increments drifts away from the number a player can compute
 * on their own, and a currency a player can audit and the server cannot reproduce is worse than one
 * with fewer decimal places. Rounding at every boundary bounds the error at half a hundredth,
 * permanently.
 *
 * <h2>Money is compared through here too</h2>
 *
 * {@code balance >= price} is a bug waiting for the first price whose double representation is a
 * hair above the balance that was supposed to cover it. {@link #atLeast} compares in hundredths,
 * where the question has an exact answer.
 *
 * <h2>Storage</h2>
 *
 * Mongo already stores robs as a {@code Number}, which is a double — so nothing needed migrating for
 * this. What did need saying is that the plugin's own atomics hold <em>hundredths as a long</em>:
 * see {@link #toMinor}. A compare-and-set over an integer is exact and lock-free, which a
 * compare-and-set over an accumulating double is not.
 */
public final class Robs {

    /** Decimal places a rob is expressed to. */
    public static final int SCALE = 2;

    /** Hundredths per rob. The factor between the public {@code double} and the internal {@code long}. */
    private static final double MINOR_UNITS = 100d;

    /**
     * Grouped, with up to two decimal places and no trailing zeros.
     *
     * A whole amount therefore reads exactly as it always did — {@code 1,240} rather than
     * {@code 1,240.00} — so making the currency decimal did not make every existing message noisier
     * for the overwhelming majority of amounts that are still whole.
     */
    private static final ThreadLocal<DecimalFormat> DISPLAY = ThreadLocal.withInitial(() ->
            new DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.ROOT)));

    private Robs() {
    }

    /**
     * Rounds to two places, half-up.
     *
     * Half-up rather than {@code Math.round}'s half-ceiling or {@code BigDecimal}'s banker's
     * rounding, because it is the rule a player applies in their head. A currency that rounds in a
     * way its users would not is a currency they think is broken.
     */
    public static double round(double amount) {
        if (!Double.isFinite(amount)) {
            return 0d;
        }

        return BigDecimal.valueOf(amount).setScale(SCALE, RoundingMode.HALF_UP).doubleValue();
    }

    /** The amount in hundredths, rounded. The exact integer form, for atomics and comparisons. */
    public static long toMinor(double amount) {
        if (!Double.isFinite(amount)) {
            return 0L;
        }

        return BigDecimal.valueOf(amount)
                .movePointRight(SCALE)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    public static double fromMinor(long minor) {
        return minor / MINOR_UNITS;
    }

    /** Adds two amounts without accumulating representation error. */
    public static double add(double first, double second) {
        return fromMinor(toMinor(first) + toMinor(second));
    }

    public static double subtract(double from, double amount) {
        return fromMinor(toMinor(from) - toMinor(amount));
    }

    /** Multiplies an amount by a count, rounding once at the end rather than per item. */
    public static double multiply(double amount, long count) {
        return round(amount * count);
    }

    /** Whether {@code balance} covers {@code price}, decided in hundredths where it is exact. */
    public static boolean atLeast(double balance, double price) {
        return toMinor(balance) >= toMinor(price);
    }

    /** Whether an amount is worth acting on at all — anything below half a hundredth is not. */
    public static boolean isPositive(double amount) {
        return toMinor(amount) > 0L;
    }

    public static boolean isZero(double amount) {
        return toMinor(amount) == 0L;
    }

    /** Never negative, and never a fraction of a hundredth. For amounts read from config or input. */
    public static double sanitise(double amount) {
        return Math.max(0d, round(amount));
    }

    /** Grouped for display: {@code 1,240}, {@code 1,240.5}, {@code 1,240.56}. */
    public static String format(double amount) {
        return DISPLAY.get().format(round(amount));
    }

    /**
     * Reads an amount a player or an operator typed.
     *
     * Accepts grouping separators and a leading plus, because people type {@code 1,000} and
     * {@code +50}. Refuses anything else rather than guessing — a mistyped amount that silently
     * becomes a different one is a support ticket about stolen robs.
     *
     * @return empty when it is not a number, is negative, or is too large to be a real balance
     */
    public static Optional<Double> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }

        String cleaned = raw.trim().replace(",", "").replace("_", "");

        if (cleaned.startsWith("+")) {
            cleaned = cleaned.substring(1);
        }

        try {
            BigDecimal parsed = new BigDecimal(cleaned);

            if (parsed.signum() < 0 || parsed.compareTo(MAX) > 0) {
                return Optional.empty();
            }

            return Optional.of(parsed.setScale(SCALE, RoundingMode.HALF_UP).doubleValue());
        } catch (NumberFormatException notANumber) {
            return Optional.empty();
        }
    }

    /**
     * The largest amount any single operation may name.
     *
     * A cap rather than {@link Double#MAX_VALUE}: beyond this a double can no longer represent
     * hundredths exactly, so an amount above it is a typo or an exploit attempt and there is no
     * reading of it that produces a correct balance.
     */
    private static final BigDecimal MAX = BigDecimal.valueOf(1_000_000_000_000L);

    /** Whether an amount is within what a single operation may name. */
    public static boolean withinLimit(double amount) {
        return Double.isFinite(amount) && BigDecimal.valueOf(Math.abs(amount)).compareTo(MAX) <= 0;
    }
}
