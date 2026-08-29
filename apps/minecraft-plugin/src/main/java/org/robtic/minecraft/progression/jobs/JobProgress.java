package org.robtic.minecraft.progression.jobs;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * One player's standing in one job.
 *
 * <h2>XP is stored; level is not</h2>
 *
 * There is no level field, and that is deliberate — see {@link XpCurve} for why storing both is a
 * data-integrity problem waiting for the first curve edit. {@link #level(XpCurve)} derives it.
 *
 * <h2>Why unlocked titles are stored here as well</h2>
 *
 * The titles themselves live in {@code PlayerTitles}, which is the one authority on what a player
 * owns. This set is a record of which of them <em>this job</em> handed out, kept for exactly one
 * reason: resignation has to take back precisely what the job gave.
 *
 * Recomputing that from the job's configured milestones instead would be wrong in the one case that
 * matters. An operator removes a milestone from {@code jobs.yml}; a player who unlocked it months
 * ago resigns; the recomputed set no longer contains it, and they keep a job title for a job they no
 * longer have. Storing what was actually granted makes resignation exact regardless of how the
 * config has moved since.
 *
 * @param jobId           the job this is progress in
 * @param totalXp         lifetime XP in this job. Never negative; the service refuses to make it so
 * @param statistics      counters for the actions this job rewards
 * @param unlockedTitles  ids of titles this job granted, for exact removal on resignation
 * @param joinedAt        epoch millis the job was claimed, for "member since" in the profile
 * @param lastInteraction epoch millis of the last XP gain, used by the idle checks and diagnostics
 */
public record JobProgress(
        String jobId,
        long totalXp,
        JobStatistics statistics,
        Set<String> unlockedTitles,
        long joinedAt,
        long lastInteraction
) {

    public JobProgress {
        totalXp = Math.max(0L, totalXp);
        unlockedTitles = java.util.Collections.unmodifiableSet(new LinkedHashSet<>(unlockedTitles));
    }

    /** A freshly claimed job. */
    public static JobProgress fresh(String jobId, long now) {
        return new JobProgress(jobId, 0L, JobStatistics.EMPTY, Set.of(), now, now);
    }

    public int level(XpCurve curve) {
        return curve.levelAt(totalXp);
    }

    /**
     * Adds XP, saturating rather than overflowing.
     *
     * A negative award is ignored instead of subtracting. Nothing in the design takes XP away, so a
     * negative value can only come from a misconfigured reward or a bad multiplier — and silently
     * draining a player's progress is the worst possible response to either.
     */
    public JobProgress plusXp(long amount, long now) {
        if (amount <= 0L) {
            return this;
        }

        long next = totalXp > Long.MAX_VALUE - amount ? Long.MAX_VALUE : totalXp + amount;

        return new JobProgress(jobId, next, statistics, unlockedTitles, joinedAt, now);
    }

    public JobProgress counting(String key, long amount) {
        return new JobProgress(jobId, totalXp, statistics.plus(key, amount),
                unlockedTitles, joinedAt, lastInteraction);
    }

    /** Records that this job granted a title. Idempotent. */
    public JobProgress withUnlockedTitle(String titleId) {
        if (unlockedTitles.contains(titleId)) {
            return this;
        }

        Set<String> next = new LinkedHashSet<>(unlockedTitles);
        next.add(titleId);

        return new JobProgress(jobId, totalXp, statistics, next, joinedAt, lastInteraction);
    }
}
