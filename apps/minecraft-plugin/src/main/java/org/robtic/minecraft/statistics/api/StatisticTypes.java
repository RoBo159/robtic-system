package org.robtic.minecraft.statistics.api;

import org.robtic.minecraft.util.Ids;

import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The built-in {@link StatisticType}s, and the registry a plugin adds its own to.
 *
 * <h2>Why the registry is static</h2>
 *
 * Types are resolved while parsing {@code statistics.yml}, which happens before the statistics
 * service exists, and by codecs that decode a stored record without a service in hand. Threading an
 * instance through all of that would buy nothing: a type is a stateless, immutable description of how
 * to read a number, the set of them is fixed within a server run, and two servers in one JVM would
 * want the same set anyway.
 *
 * The registry is concurrent because a plugin may register during its own enable, on the main thread,
 * while nothing else is reading — but the reads happen from placeholder resolution and from worker
 * threads decoding player records, and a plain map would be a data race waiting for the one server
 * that registers a type late.
 */
public final class StatisticTypes {

    /** A plain count. What almost every statistic is. */
    public static final StatisticType LONG = new Numeric("long") {
        @Override
        public String format(long raw) {
            return NUMBERS.format(raw);
        }
    };

    /**
     * A fractional value, stored as the double's raw bits.
     *
     * Bits rather than a rounded long so nothing is lost in the round trip. Accumulating into one is
     * still meaningful — see {@link #addDouble} — but it goes through a compare-and-set on the bit
     * pattern rather than through {@code AtomicLong.addAndGet}, which would add the bit patterns
     * together and produce nonsense.
     */
    public static final StatisticType DOUBLE = new Numeric("double") {
        @Override
        public String format(long raw) {
            return DECIMALS.format(Double.longBitsToDouble(raw));
        }
    };

    /** Zero or one. */
    public static final StatisticType BOOLEAN = new Numeric("boolean") {
        @Override
        public boolean accumulable() {
            // "Has linked their account, plus one" is not a thing. Refusing is how a caller finds
            // out they meant `set` rather than discovering a flag reading 47 a month later.
            return false;
        }

        @Override
        public String format(long raw) {
            return raw != 0L ? "yes" : "no";
        }
    };

    /** A span of time in milliseconds. Accumulable: time played adds up. */
    public static final StatisticType DURATION = new Numeric("duration") {
        @Override
        public String format(long raw) {
            return describe(Duration.ofMillis(Math.max(0L, raw)));
        }
    };

    /** A moment, as epoch milliseconds. Zero means "never". */
    public static final StatisticType TIMESTAMP = new Numeric("timestamp") {
        @Override
        public boolean accumulable() {
            return false;
        }

        @Override
        public String format(long raw) {
            return raw <= 0L
                    ? "-"
                    : TIMES.format(Instant.ofEpochMilli(raw).atZone(ZoneId.systemDefault()));
        }
    };

    /** A short piece of text — the last biome entered, the last boss killed. */
    public static final StatisticType TEXT = new StatisticType() {
        @Override
        public String id() {
            return "text";
        }

        @Override
        public Kind kind() {
            return Kind.TEXT;
        }

        @Override
        public String format(String raw) {
            return raw == null || raw.isBlank() ? "-" : raw;
        }
    };

    private static final NumberFormat NUMBERS = NumberFormat.getInstance(Locale.ROOT);
    private static final NumberFormat DECIMALS = decimals();
    private static final DateTimeFormatter TIMES =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ROOT);

    private static final Map<String, StatisticType> REGISTERED = new ConcurrentHashMap<>();

    static {
        List.of(LONG, DOUBLE, BOOLEAN, DURATION, TIMESTAMP, TEXT).forEach(StatisticTypes::register);
    }

    private StatisticTypes() {
    }

    /**
     * Registers a type, or replaces one already registered under the same id.
     *
     * Replacing is allowed deliberately. A server that wants counts rendered with its own separators
     * should be able to swap {@code long} without every statistic having to name a different type —
     * and since a type only affects presentation and whether accumulation is permitted, swapping one
     * cannot corrupt anything already stored.
     *
     * @return whether the id was accepted; an id that is not a valid identifier is refused
     */
    public static boolean register(StatisticType type) {
        if (type == null || !Ids.valid(Ids.normalise(type.id()))) {
            return false;
        }

        REGISTERED.put(Ids.normalise(type.id()), type);
        return true;
    }

    public static Optional<StatisticType> find(String id) {
        return Optional.ofNullable(REGISTERED.get(Ids.normalise(id)));
    }

    public static Collection<StatisticType> all() {
        return List.copyOf(REGISTERED.values());
    }

    // ─── Encoding helpers ─────────────────────────────────────────────────────────────────────
    //
    // The one place that knows how each numeric type maps onto a long. Callers deal in doubles and
    // booleans; storage only ever sees the long.

    public static long encodeDouble(double value) {
        return Double.doubleToRawLongBits(value);
    }

    public static double decodeDouble(long raw) {
        return Double.longBitsToDouble(raw);
    }

    public static long encodeBoolean(boolean value) {
        return value ? 1L : 0L;
    }

    public static boolean decodeBoolean(long raw) {
        return raw != 0L;
    }

    /** Adds to a stored double, in the bit representation. See {@link #DOUBLE}. */
    public static long addDouble(long raw, double amount) {
        return encodeDouble(decodeDouble(raw) + amount);
    }

    /**
     * Saturating addition.
     *
     * A counter that has run for years should stick at "enormous" rather than wrap into a negative
     * and break every comparison, leaderboard and unlock condition that reads it.
     */
    public static long addSaturating(long current, long amount) {
        if (amount > 0L) {
            return current > Long.MAX_VALUE - amount ? Long.MAX_VALUE : current + amount;
        }

        if (amount < 0L) {
            return current < Long.MIN_VALUE - amount ? Long.MIN_VALUE : current + amount;
        }

        return current;
    }

    /** A duration as "3d 4h", "5h 12m" or "40s" — enough precision to act on, not enough to be noise. */
    private static String describe(Duration duration) {
        long days = duration.toDays();

        if (days > 0) {
            return days + "d " + duration.toHoursPart() + "h";
        }

        if (duration.toHours() > 0) {
            return duration.toHours() + "h " + duration.toMinutesPart() + "m";
        }

        return duration.toMinutes() > 0
                ? duration.toMinutes() + "m " + duration.toSecondsPart() + "s"
                : duration.toSecondsPart() + "s";
    }

    private static NumberFormat decimals() {
        NumberFormat format = NumberFormat.getInstance(Locale.ROOT);
        format.setMaximumFractionDigits(2);
        format.setMinimumFractionDigits(0);
        return format;
    }

    /** Shared base for the numeric built-ins, so each only states what differs. */
    private abstract static class Numeric implements StatisticType {

        private final String id;

        private Numeric(String id) {
            this.id = id;
        }

        @Override
        public String id() {
            return id;
        }

        @Override
        public Kind kind() {
            return Kind.NUMERIC;
        }
    }
}
