package org.robtic.jobs.jobs;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Counters a job accumulates, keyed by whatever the thing being counted is called.
 *
 * <h2>An open map, not fields</h2>
 *
 * The obvious design is {@code blocksMined}, {@code fishCaught}, {@code cropsHarvested} — and it is
 * wrong here, because the set of jobs is configured rather than coded. A server adding a Beekeeper
 * job would need this class edited, recompiled and released before it could count anything, which
 * defeats the point of jobs being configurable at all.
 *
 * So keys are strings built from the same {@link JobAction} the XP system uses: {@code break:STONE},
 * {@code fish:COD}, {@code kill:ZOMBIE}. The statistics a job collects are exactly the actions it
 * rewards, with no separate configuration and no chance of the two drifting apart.
 *
 * <h2>Immutable and saturating</h2>
 *
 * Copy-on-write for the same reason as {@link org.robtic.core.titles.PlayerTitles}:
 * read on the tick, written from callbacks. Increments saturate at {@link Long#MAX_VALUE} rather
 * than wrapping — a counter that has run for years should stick at "enormous", not silently become
 * negative and break every comparison that reads it.
 */
public record JobStatistics(Map<String, Long> counters) {

    public static final JobStatistics EMPTY = new JobStatistics(Map.of());

    public JobStatistics {
        counters = Map.copyOf(counters);
    }

    public long get(String key) {
        return counters.getOrDefault(key, 0L);
    }

    public Set<String> keys() {
        return counters.keySet();
    }

    /** @return a new instance with {@code key} increased by {@code amount}, saturating at the cap */
    public JobStatistics plus(String key, long amount) {
        if (amount <= 0L) {
            return this;
        }

        Map<String, Long> next = new LinkedHashMap<>(counters);

        next.merge(key, amount, (existing, added) ->
                existing > Long.MAX_VALUE - added ? Long.MAX_VALUE : existing + added);

        return new JobStatistics(next);
    }

    /** The sum of every counter, for a headline "actions performed" figure in the profile GUI. */
    public long total() {
        long sum = 0L;

        for (long value : counters.values()) {
            sum = sum > Long.MAX_VALUE - value ? Long.MAX_VALUE : sum + value;
        }

        return sum;
    }
}
