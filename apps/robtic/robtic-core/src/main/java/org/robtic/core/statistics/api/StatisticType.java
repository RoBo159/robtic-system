package org.robtic.core.statistics.api;

/**
 * What a statistic's value <em>means</em>, and how to show it.
 *
 * <h2>Two storage shapes, many types</h2>
 *
 * A statistic is stored as either a {@code long} or a {@link String}. That is not a simplification
 * imposed on the design — it is the whole of it. A double is a long via
 * {@link Double#doubleToRawLongBits}, a boolean is 0 or 1, a duration is milliseconds, a timestamp is
 * epoch milliseconds. Every numeric type therefore shares one storage representation, one codec, one
 * persistence format, and — the part that actually matters — one lock-free increment path built on
 * {@code AtomicLong}.
 *
 * The alternative, a value hierarchy with a boxed object per statistic, would allocate on every
 * write. Statistics are written thousands of times a second while a player mines, so that cost is the
 * design constraint rather than an afterthought.
 *
 * <h2>An interface, not an enum</h2>
 *
 * The brief asks for future custom types, and an enum cannot be extended by a plugin that does not
 * ship with this one. A type is therefore an interface: it names itself, says which of the two
 * storage shapes it uses, says whether accumulating into it is meaningful, and knows how to render
 * itself for a player. {@link StatisticTypes} holds the built-ins and the registry for new ones.
 *
 * A custom type adds no storage format and no codec work — it is a new way of reading a number that
 * was already being stored.
 *
 * <h2>Contract</h2>
 *
 * Implementations must be immutable, thread-safe and free of side effects. {@link #format} is called
 * from placeholder resolution, which a tab list performs for every player every second.
 */
public interface StatisticType {

    /** Which of the two storage shapes a type uses. Nothing else is persisted. */
    enum Kind {
        /** Stored as a {@code long}. Every numeric type, however it is interpreted. */
        NUMERIC,
        /** Stored as a {@link String}. For the rare statistic that records a name rather than a count. */
        TEXT
    }

    /** Stable lowercase identifier, as written in {@code statistics.yml}. */
    String id();

    Kind kind();

    /**
     * Whether {@code increment}, {@code add} and {@code subtract} mean anything for this type.
     *
     * False for a timestamp or a name: "the last time they logged in, plus one" is not a value
     * anybody wants, and silently allowing it turns a caller's mistake into corrupt data. The service
     * refuses those calls and says so once.
     */
    default boolean accumulable() {
        return kind() == Kind.NUMERIC;
    }

    /**
     * Renders a stored number for a player.
     *
     * @param raw the stored {@code long}, in whatever encoding this type uses
     */
    default String format(long raw) {
        return Long.toString(raw);
    }

    /** Renders a stored string. Only called for {@link Kind#TEXT}. */
    default String format(String raw) {
        return raw == null ? "" : raw;
    }
}
