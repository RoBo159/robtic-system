package org.robtic.core.statistics.storage;

import org.robtic.core.statistics.api.ResetPolicy;
import org.robtic.core.statistics.api.StatisticTypes;

import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * One player's statistic values.
 *
 * <h2>Mutable, unlike everything else in this plugin</h2>
 *
 * Titles, jobs and workspaces are immutable records rebuilt on every change, and that is right for
 * them: they change a handful of times a session and the copy is trivial. Statistics do not. A player
 * mining generates a write every tick, sometimes several, and a copy-on-write map would allocate and
 * copy the player's entire statistic set on each one — turning the busiest structure on the server
 * into its largest source of garbage.
 *
 * So this is mutable and thread-safe by construction. Each numeric statistic is an {@link AtomicLong}
 * allocated once, on first use; every subsequent write is a lock-free compare-and-set with no
 * allocation whatsoever, and every read is a volatile load. That is the difference between a
 * statistics system that can be called from a block-break handler and one that cannot.
 *
 * <h2>Two maps, because there are two storage shapes</h2>
 *
 * Numeric statistics live in {@link #numbers} as raw longs — see {@link StatisticTypes} for how a
 * double, a boolean, a duration and a timestamp all become one. Text statistics are rare and live
 * separately rather than forcing every counter to be boxed for their benefit.
 *
 * <h2>Dirty tracking lives here</h2>
 *
 * The repository decides when to write; this decides whether there is anything to write. Keeping the
 * flag next to the data is what lets a write be issued without holding a lock over the whole record:
 * it is cleared before the snapshot is taken, so a change racing the write re-dirties it and is
 * caught by the next flush rather than being silently dropped.
 */
public final class PlayerStatistics {

    private final Map<String, AtomicLong> numbers = new ConcurrentHashMap<>();
    private final Map<String, String> texts = new ConcurrentHashMap<>();

    /**
     * The period stamp each reset policy's values belong to.
     *
     * See {@link ResetPolicy}: a reset is a stamp mismatch rather than a scheduled job, so this is
     * the entire state the reset machinery needs.
     */
    private final Map<ResetPolicy, Long> periods = new ConcurrentHashMap<>();

    private final AtomicBoolean dirty = new AtomicBoolean(false);

    /** A player with no recorded values. Also what a failed load degrades to. */
    public static PlayerStatistics empty() {
        return new PlayerStatistics();
    }

    // ─── Numeric ──────────────────────────────────────────────────────────────────────────────

    /**
     * The stored value, or {@code fallback} when this player has never recorded one.
     *
     * Does not create an entry. A read must not allocate — placeholders resolve statistics for every
     * player every second, and a read that inserted would give every player an entry for every
     * statistic anything ever asked about.
     */
    public long get(String id, long fallback) {
        AtomicLong value = numbers.get(id);
        return value == null ? fallback : value.get();
    }

    public boolean has(String id) {
        return numbers.containsKey(id) || texts.containsKey(id);
    }

    /**
     * Adds to a counter, saturating.
     *
     * The hot path. One map lookup, one CAS loop, no allocation after the first call for this
     * statistic. Saturating rather than wrapping because a counter that has run for years should
     * stick at "enormous" instead of quietly becoming negative and breaking every comparison,
     * leaderboard and unlock condition that reads it.
     *
     * @return the value after the change
     */
    public long add(String id, long fallback, long amount) {
        if (amount == 0L) {
            return get(id, fallback);
        }

        long updated = entry(id, fallback)
                .accumulateAndGet(amount, StatisticTypes::addSaturating);

        dirty.set(true);
        return updated;
    }

    /** Adds to a double-typed counter, in the bit representation. */
    public double addDouble(String id, long fallback, double amount) {
        if (amount == 0.0d) {
            return StatisticTypes.decodeDouble(get(id, fallback));
        }

        AtomicLong holder = entry(id, fallback);
        long current;
        long next;

        // A CAS loop rather than accumulateAndGet, because the operator has to decode, add and
        // re-encode — and doing that inside accumulateAndGet's lambda would capture `amount` and
        // allocate on every call.
        do {
            current = holder.get();
            next = StatisticTypes.addDouble(current, amount);
        } while (!holder.compareAndSet(current, next));

        dirty.set(true);
        return StatisticTypes.decodeDouble(next);
    }

    /** Replaces a value outright. @return the value before the change */
    public long set(String id, long fallback, long value) {
        long previous = entry(id, fallback).getAndSet(value);

        if (previous != value) {
            dirty.set(true);
        }

        return previous;
    }

    // ─── Text ─────────────────────────────────────────────────────────────────────────────────

    public String getText(String id, String fallback) {
        String value = texts.get(id);
        return value == null ? fallback : value;
    }

    /** @return the text before the change, or {@code fallback} when there was none */
    public String setText(String id, String fallback, String value) {
        String previous = value == null ? texts.remove(id) : texts.put(id, value);

        if (!java.util.Objects.equals(previous, value)) {
            dirty.set(true);
        }

        return previous == null ? fallback : previous;
    }

    // ─── Resets ───────────────────────────────────────────────────────────────────────────────

    /**
     * Clears one statistic.
     *
     * The entry is removed rather than set to its default, so a statistic a player has never
     * meaningfully used costs nothing to store. Reads fall back to the definition's default, which is
     * the same answer.
     *
     * @return whether anything was actually held
     */
    public boolean clear(String id) {
        // Both removals run. Short-circuiting would leave a text value behind for the — admittedly
        // improbable — record that holds both under one id, which is exactly the sort of leftover
        // that turns up months later as a statistic that will not reset.
        boolean hadNumber = numbers.remove(id) != null;
        boolean hadText = texts.remove(id) != null;
        boolean held = hadNumber || hadText;

        if (held) {
            dirty.set(true);
        }

        return held;
    }

    /** Clears everything. */
    public void clearAll() {
        if (!numbers.isEmpty() || !texts.isEmpty()) {
            numbers.clear();
            texts.clear();
            dirty.set(true);
        }
    }

    /** The period stamp these values were last reset for, under one policy. */
    public long period(ResetPolicy policy) {
        return periods.getOrDefault(policy, 0L);
    }

    public void period(ResetPolicy policy, long stamp) {
        Long previous = periods.put(policy, stamp);

        if (previous == null || previous != stamp) {
            dirty.set(true);
        }
    }

    // ─── Persistence support ──────────────────────────────────────────────────────────────────

    /**
     * Whether anything has changed since the last write, clearing the flag.
     *
     * Cleared as it is read, and read before the snapshot is taken, so a change made while a write is
     * in flight re-dirties the record and is caught by the next flush. Clearing it afterwards instead
     * would discard exactly that change.
     */
    public boolean takeDirty() {
        return dirty.getAndSet(false);
    }

    public void markDirty() {
        dirty.set(true);
    }

    public boolean isDirty() {
        return dirty.get();
    }

    /** Every numeric id held, for the codec and for {@code resetCategory}. */
    public Set<String> numericIds() {
        return Set.copyOf(numbers.keySet());
    }

    public Set<String> textIds() {
        return Set.copyOf(texts.keySet());
    }

    /**
     * A read-only view of the numeric values, for the codec.
     *
     * Copied rather than exposed live: the codec runs on a worker while the player keeps mining, and
     * serialising a map that is being written to is how a save ends up with a value that never
     * existed at any single moment.
     */
    public Map<String, Long> numbers() {
        Map<String, Long> copy = new java.util.LinkedHashMap<>(numbers.size());
        numbers.forEach((id, value) -> copy.put(id, value.get()));
        return Collections.unmodifiableMap(copy);
    }

    public Map<String, String> texts() {
        return Map.copyOf(texts);
    }

    public Map<ResetPolicy, Long> periods() {
        return Map.copyOf(periods);
    }

    /** Used by the codec when rebuilding a loaded record. Not part of the public API. */
    public void restore(Map<String, Long> loadedNumbers, Map<String, String> loadedTexts,
                        Map<ResetPolicy, Long> loadedPeriods) {
        numbers.clear();
        texts.clear();
        periods.clear();

        loadedNumbers.forEach((id, value) -> numbers.put(id, new AtomicLong(value)));
        loadedTexts.forEach(texts::put);
        loadedPeriods.forEach(periods::put);

        dirty.set(false);
    }

    public boolean isEmpty() {
        return numbers.isEmpty() && texts.isEmpty() && periods.isEmpty();
    }

    /**
     * The holder for a statistic, created on first write.
     *
     * {@code computeIfAbsent} rather than a get-then-put, so two threads incrementing the same
     * statistic for the same player at the same moment cannot each install a holder and have one of
     * the increments land on an object that is immediately discarded.
     */
    private AtomicLong entry(String id, long fallback) {
        return numbers.computeIfAbsent(id, key -> new AtomicLong(fallback));
    }
}
