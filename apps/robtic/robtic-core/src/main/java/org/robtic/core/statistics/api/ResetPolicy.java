package org.robtic.core.statistics.api;

import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.WeekFields;
import java.util.Locale;
import java.util.Optional;

/**
 * When a statistic goes back to its default.
 *
 * <h2>Periods are compared, not scheduled</h2>
 *
 * The obvious implementation is a timer that fires at midnight and clears every daily statistic.
 * It is also wrong for a game server: the timer does not fire while the server is down, does not fire
 * for the players who were offline, and fires at whatever moment the server happens to be running
 * rather than at the moment the day changed.
 *
 * So nothing is scheduled. Each player's record carries the period stamp their values belong to, and
 * a reset happens when that stamp no longer matches the current one — checked when they load and
 * periodically while they are online. A player who was away for a month comes back to a cleared daily
 * counter without anything having had to run while they were gone, and a server that was down over
 * the rollover is correct the moment it starts.
 *
 * <h2>Adding a period later</h2>
 *
 * A new policy is a new constant and a new {@link #stamp} case. Nothing stored changes shape: the
 * stamp is an opaque long compared for equality, so a policy whose stamp is computed differently
 * needs no migration.
 */
public enum ResetPolicy {

    /** The default. A lifetime total. */
    NEVER,

    /**
     * Cleared every time the player's data is loaded.
     *
     * Never persisted at all — see {@link StatisticDefinition#persistent()} for the related but
     * different case of a statistic that is not stored even within a session.
     */
    SESSION,

    DAILY,
    WEEKLY,
    MONTHLY;

    /** Whether values under this policy are compared against a period stamp. */
    public boolean periodic() {
        return this == DAILY || this == WEEKLY || this == MONTHLY;
    }

    /**
     * The stamp identifying the period a moment falls in.
     *
     * Equality is the only operation performed on it, so the encoding only has to be stable and
     * collision-free within a policy — {@code 20260826} for a day, {@code 202634} for an ISO week,
     * {@code 202608} for a month.
     *
     * @return empty for the policies that do not use a stamp
     */
    public Optional<Long> stamp(long epochMillis, ZoneId zone) {
        if (!periodic()) {
            return Optional.empty();
        }

        var date = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate();

        return Optional.of(switch (this) {
            case DAILY -> date.getYear() * 10_000L + date.getMonthValue() * 100L + date.getDayOfMonth();
            // ISO weeks, so a week is Monday to Sunday everywhere rather than depending on the
            // server's locale — which would silently change the reset day on a JVM upgrade.
            case WEEKLY -> {
                WeekFields weeks = WeekFields.ISO;
                yield date.get(weeks.weekBasedYear()) * 100L + date.get(weeks.weekOfWeekBasedYear());
            }
            case MONTHLY -> date.getYear() * 100L + date.getMonthValue();
            default -> 0L;
        });
    }

    public static ResetPolicy parse(String raw, ResetPolicy fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }

        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            return fallback;
        }
    }
}
