package org.robtic.jobs.jobs;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Every job one player holds, and which of them are currently active.
 *
 * <h2>Owned and active are different things</h2>
 *
 * A premium tier 2 player owns three jobs and works two. The third keeps its XP, its level, its
 * statistics and its titles — it simply stops earning. That distinction is the whole reason job
 * switching is safe: nothing is destroyed by going inactive, so a player can move between their jobs
 * freely and only resignation is lossy.
 *
 * The limits themselves are not here. This is a value object; how many of each tier a player may
 * hold is a policy question that {@code JobService} answers from configuration, because the answer
 * changes with premium tier and with the {@code robtic.tester} permission, neither of which a record
 * should know about.
 *
 * <h2>Invariant</h2>
 *
 * Active is always a subset of owned. Enforced in the compact constructor rather than trusted,
 * because this is reconstructed from stored JSON that may have been written by an older version, by
 * a partially failed write, or by hand.
 *
 * @param owned  progress per job id, in the order the jobs were claimed
 * @param active ids of the jobs currently earning XP
 */
public record PlayerJobs(Map<String, JobProgress> owned, Set<String> active) {

    public static final PlayerJobs EMPTY = new PlayerJobs(Map.of(), Set.of());

    public PlayerJobs {
        owned = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(owned));

        // Anything active but not owned is dropped. A stored file that disagrees with itself is
        // repaired towards the safe reading — you cannot work a job you do not have.
        Set<String> filtered = new LinkedHashSet<>(active);
        filtered.retainAll(owned.keySet());
        active = java.util.Collections.unmodifiableSet(filtered);
    }

    public boolean owns(String jobId) {
        return owned.containsKey(jobId);
    }

    public boolean isActive(String jobId) {
        return active.contains(jobId);
    }

    public Optional<JobProgress> progress(String jobId) {
        return Optional.ofNullable(owned.get(jobId));
    }

    public int ownedCount() {
        return owned.size();
    }

    public int activeCount() {
        return active.size();
    }

    /** Claims a job. Already-owned is a no-op, so a double-click cannot reset someone's progress. */
    public PlayerJobs withJob(JobProgress progress) {
        if (owned.containsKey(progress.jobId())) {
            return this;
        }

        Map<String, JobProgress> next = new LinkedHashMap<>(owned);
        next.put(progress.jobId(), progress);

        return new PlayerJobs(next, active);
    }

    /**
     * Resigns from a job, dropping its progress and deactivating it.
     *
     * Both together, and the constructor would enforce it anyway — a job removed from {@code owned}
     * but left in {@code active} is the exact inconsistency the compact constructor exists to
     * repair, and producing it here deliberately would be relying on that repair.
     */
    public PlayerJobs withoutJob(String jobId) {
        if (!owned.containsKey(jobId)) {
            return this;
        }

        Map<String, JobProgress> next = new LinkedHashMap<>(owned);
        next.remove(jobId);

        Set<String> stillActive = new LinkedHashSet<>(active);
        stillActive.remove(jobId);

        return new PlayerJobs(next, stillActive);
    }

    /** Replaces one job's progress. Ignored when the job is not owned. */
    public PlayerJobs withProgress(JobProgress progress) {
        if (!owned.containsKey(progress.jobId())) {
            return this;
        }

        Map<String, JobProgress> next = new LinkedHashMap<>(owned);
        next.put(progress.jobId(), progress);

        return new PlayerJobs(next, active);
    }

    public PlayerJobs activating(String jobId) {
        if (!owned.containsKey(jobId) || active.contains(jobId)) {
            return this;
        }

        Set<String> next = new LinkedHashSet<>(active);
        next.add(jobId);

        return new PlayerJobs(owned, next);
    }

    public PlayerJobs deactivating(String jobId) {
        if (!active.contains(jobId)) {
            return this;
        }

        Set<String> next = new LinkedHashSet<>(active);
        next.remove(jobId);

        return new PlayerJobs(owned, next);
    }
}
