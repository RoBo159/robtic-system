package org.robtic.core.license.hooks;

import org.robtic.core.license.LicenseService;
import org.robtic.core.license.api.License;
import org.robtic.core.statistics.StatisticsService;

import java.util.UUID;

/**
 * Records what the licence system does into the statistics system.
 *
 * <h2>No counters live here</h2>
 *
 * This class holds no state at all. Every number it produces goes straight to
 * {@link StatisticsService} and is read back from there — by a menu, a placeholder, a badge system
 * or a leaderboard. A bridge that cached "licences renewed" locally would break the one-source-of-
 * truth rule on its first line.
 *
 * <h2>Which way the arrow points</h2>
 *
 * Licences depend on statistics; statistics knows nothing about licences. That is the correct
 * direction for core infrastructure, and it is why this class lives in the licence module: the
 * module that owns a fact is the module that records it.
 *
 * <h2>Per-licence statistics</h2>
 *
 * A licence may name its own statistic in {@code licenses.yml}. When it does, using that licence
 * increments both the general counter and the specific one — the same shape the vanilla block
 * recorder uses, and for the same reason: "how many licences have I used" and "how many times have
 * I used the miner licence" are different questions and both get asked.
 */
public final class LicenseStatistics {

    // The ids this bridge writes. Declared in statistics.yml; named here because this is the code
    // that produces them, and a constant is the one place a rename has to be made.
    private static final String OBTAINED = "licenses_obtained";
    private static final String RENEWED = "licenses_renewed";
    private static final String EXPIRED = "licenses_expired";
    private static final String USED = "licenses_used";
    private static final String REVOKED = "licenses_revoked";
    private static final String RENEWAL_SPENT = "license_renewal_spent";

    private final StatisticsService statistics;

    public LicenseStatistics(StatisticsService statistics) {
        this.statistics = statistics;
    }

    /**
     * Subscribes to the licence service.
     *
     * Through the service's own listener hooks rather than through Bukkit events, deliberately. A
     * statistic must be recorded whether or not anything else is listening, and it is not something
     * another plugin should be able to cancel by cancelling an event.
     */
    public void register(LicenseService licenses) {
        licenses.onObtained(this::obtained);
        licenses.onRenewed(this::renewed);
        licenses.onExpired(this::expired);
        licenses.onRevoked(this::revoked);
        licenses.onUsed(this::used);
    }

    private void obtained(UUID playerId, License license) {
        statistics.increment(playerId, OBTAINED);
    }

    private void renewed(UUID playerId, License license, double cost) {
        statistics.increment(playerId, RENEWED);

        // The total spent, not the number of renewals — that is what RENEWED already counts. Robs
        // carry decimals, so this goes through the double path rather than being rounded away.
        statistics.addDouble(playerId, RENEWAL_SPENT, cost);
    }

    private void expired(UUID playerId, License license) {
        statistics.increment(playerId, EXPIRED);
    }

    private void revoked(UUID playerId, License license) {
        statistics.increment(playerId, REVOKED);
    }

    private void used(UUID playerId, License license) {
        statistics.increment(playerId, USED);

        // The licence's own statistic, when it names one. Registered in statistics.yml like any
        // other; an unregistered id is reported once by the statistics service rather than here.
        if (!license.statisticId().isBlank()) {
            statistics.increment(playerId, license.statisticId());
        }
    }
}
