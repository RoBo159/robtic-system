package org.robtic.jobs.market;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Daily sell quotas and per-sale cooldowns, held in memory.
 *
 * <h2>Deliberately not persisted</h2>
 *
 * A quota that resets when the server restarts is weaker than one that survives. That is a real
 * limitation and it is the right trade here: persisting it would put a storage write on every sale —
 * the hottest economic action in the system — to enforce a limit whose purpose is pacing rather than
 * security. A restart is rare, and a player who happens to be online for one gets a second allowance.
 *
 * If a server later needs this to be exact, the fix is to move these counters into
 * {@code JobStatistics}, which is already persisted per job. The interface here would not change.
 *
 * <h2>The day boundary</h2>
 *
 * Rollover is computed from the configured zone rather than from elapsed time, so "daily" means the
 * same thing to a player as it does to the operator who set it — a quota that reset 24 hours after
 * each player's first sale would give everyone a different reset time and be impossible to explain.
 */
public final class SellQuotas {

    private record Usage(LocalDate day, int sold, long lastSaleAt) {
    }

    private final Map<UUID, Map<String, Usage>> usage = new ConcurrentHashMap<>();
    private volatile ZoneId zone = ZoneId.systemDefault();

    public void zone(ZoneId zone) {
        this.zone = zone == null ? ZoneId.systemDefault() : zone;
    }

    /** How many items this player has sold for this job today. */
    public int soldToday(UUID playerId, String jobId) {
        Usage current = current(playerId, jobId);
        return current == null ? 0 : current.sold();
    }

    /** Milliseconds left on the cooldown, or 0 when they may sell now. */
    public long cooldownRemaining(UUID playerId, String jobId, long cooldownMillis) {
        if (cooldownMillis <= 0L) {
            return 0L;
        }

        Usage current = current(playerId, jobId);

        if (current == null) {
            return 0L;
        }

        long elapsed = System.currentTimeMillis() - current.lastSaleAt();

        return elapsed >= cooldownMillis ? 0L : cooldownMillis - elapsed;
    }

    /**
     * How many of {@code requested} the quota still allows.
     *
     * Returns a partial allowance rather than refusing outright, so a player selling 64 with 10 of
     * their quota left sells 10 and keeps 54 — which is what they expect from a quota, and avoids
     * the alternative where a full inventory can never be sold at all.
     */
    public int allowance(UUID playerId, String jobId, int requested, int dailyQuota) {
        if (dailyQuota <= 0) {
            return requested;
        }

        return Math.max(0, Math.min(requested, dailyQuota - soldToday(playerId, jobId)));
    }

    /** Records a completed sale. Called only after the payment has actually landed. */
    public void record(UUID playerId, String jobId, int amount) {
        LocalDate today = LocalDate.now(zone);

        usage.computeIfAbsent(playerId, id -> new ConcurrentHashMap<>())
                .compute(jobId, (id, existing) -> {
                    int previous = existing != null && existing.day().equals(today) ? existing.sold() : 0;
                    return new Usage(today, previous + amount, System.currentTimeMillis());
                });
    }

    /** Today's usage, or null when there is none or it is from a previous day. */
    private Usage current(UUID playerId, String jobId) {
        Map<String, Usage> perJob = usage.get(playerId);

        if (perJob == null) {
            return null;
        }

        Usage found = perJob.get(jobId);

        return found != null && found.day().equals(LocalDate.now(zone)) ? found : null;
    }

    /** Forgets a player who has left, so the map does not grow with every visitor the server sees. */
    public void forget(UUID playerId) {
        usage.remove(playerId);
    }
}
