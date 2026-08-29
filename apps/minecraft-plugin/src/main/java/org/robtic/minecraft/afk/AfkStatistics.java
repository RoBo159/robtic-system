package org.robtic.minecraft.afk;

import org.robtic.minecraft.util.Robs;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * One player's AFK totals, as this server currently believes them.
 *
 * <h2>Totals, not a session</h2>
 *
 * Nothing here describes the session a player is in right now — that is {@link AfkSnapshot}, and it
 * is deliberately the only thing that knows about start times. These are the lifetime figures the
 * profile and the placeholders render, seeded from the API on join and moved forward locally when a
 * session is settled, so a player who has just come back from AFK sees the minutes they earned
 * without a read to confirm them.
 *
 * <h2>"Today" carries the day it belongs to</h2>
 *
 * A number of milliseconds is not a fact on its own — "42 minutes today" is only true until
 * midnight, and a player who is online across it would otherwise carry yesterday's figure forward
 * for the rest of the session. Storing the day alongside the total means the rollover is answered
 * at read time by {@link #todayMillis()} rather than by a scheduled task that has to fire at exactly
 * the right moment on every server in the network.
 *
 * UTC, because the API stores the same field the same way and a total that changes meaning when it
 * crosses a process boundary is worse than one that is not in the operator's local time.
 *
 * <h2>There is no rounding residue any more</h2>
 *
 * There used to be, and it existed only because robs were whole numbers: a session worth 0.83 paid
 * nothing and the fraction had to be carried into the next one. It worked within a session and was
 * discarded by every restart. Robs now carry two decimal places, so a session is simply paid what it
 * earned and there is nothing left over to remember.
 */
public record AfkStatistics(
        long totalMillis,
        long todayRawMillis,
        String todayDate,
        double totalRobs
) {

    public static final AfkStatistics EMPTY = new AfkStatistics(0L, 0L, "", 0d);

    /** Today in UTC, as the {@code yyyy-MM-dd} key both this and the API store. */
    public static String today() {
        return LocalDate.now(ZoneOffset.UTC).toString();
    }

    /** Today's AFK time, or zero once the stored figure belongs to a day that has passed. */
    public long todayMillis() {
        return today().equals(todayDate) ? todayRawMillis : 0L;
    }

    /**
     * These totals with one settled session folded in.
     *
     * Applied locally as well as sent to the API so the two agree without a second round trip: the
     * API performs the identical increment against the same day key, and a player who opens their
     * profile immediately after coming back sees the session they just finished.
     */
    public AfkStatistics plus(long sessionMillis, double robs) {
        return new AfkStatistics(
                totalMillis + Math.max(0L, sessionMillis),
                // Read through todayMillis() rather than added to the raw figure, so a session that
                // ends after midnight starts the new day at its own length instead of inheriting
                // yesterday's.
                todayMillis() + Math.max(0L, sessionMillis),
                today(),
                Robs.add(totalRobs, Math.max(0d, robs))
        );
    }

    /**
     * Adopts the API's figures.
     *
     * The API is the authority on every one of them, so this is a straight replacement. It used to
     * preserve a local rounding residue the API knew nothing about; with decimal robs there is no
     * residue, and nothing here is the game server's own arithmetic any more.
     */
    public AfkStatistics reconciledWith(AfkStatistics authoritative) {
        return authoritative;
    }

    /** Builds the totals from an API payload's raw values. */
    public static AfkStatistics of(long totalMillis, long todayMillis, String todayDate, double totalRobs) {
        return new AfkStatistics(
                Math.max(0L, totalMillis),
                Math.max(0L, todayMillis),
                todayDate == null || todayDate.isBlank() ? today() : todayDate,
                Robs.sanitise(totalRobs)
        );
    }

    /** Normalises an ISO timestamp to the day key, for an API that reports a date rather than a day. */
    public static String dayOf(String isoTimestamp) {
        if (isoTimestamp == null || isoTimestamp.isBlank()) {
            return today();
        }

        try {
            return LocalDate.ofInstant(Instant.parse(isoTimestamp), ZoneOffset.UTC).toString();
        } catch (RuntimeException unparseable) {
            return today();
        }
    }
}
