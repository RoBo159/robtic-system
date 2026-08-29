package org.robtic.jobs.license;

import org.bukkit.entity.Player;

/**
 * Whether a player may use the licence a profession requires.
 *
 * <h2>An interface, for the same reason {@code JobEconomy} is one</h2>
 *
 * Licences are RobticCore's. This package must be able to gate a claim on one without importing
 * Core's licence system, so the check arrives as a function and the Core-backed implementation lives
 * in the hooks package where every other cross-plugin bridge does. That keeps the rule "RobticJobs
 * does not own licences" true in the compiler rather than only in the documentation.
 *
 * <h2>Open by default</h2>
 *
 * {@link #OPEN} allows everything, and is what runs when the licence system failed to start or a job
 * names no licence. A server with no licences configured has a working profession loop; that is the
 * point of the licence being optional configuration rather than a hard-coded step.
 */
@FunctionalInterface
public interface JobLicenseGate {

    /** Why a licence check refused, or that it did not. */
    enum Decision {

        /** Held, in date, and nothing objected. */
        ALLOWED,

        /** The player is not carrying the licence item at all. */
        MISSING,

        /** They hold it, but it has lapsed. Renewable — see Core's {@code LicenseStatus}. */
        EXPIRED,

        /** Held and in date, but a listener refused this particular use. */
        REFUSED;

        public boolean allowed() {
            return this == ALLOWED;
        }
    }

    /**
     * What a player's licence looks like right now.
     *
     * <h2>Three states, not two</h2>
     *
     * "Not carrying one" and "cannot tell" are different answers with opposite consequences, and
     * collapsing them is how a business gets destroyed by an outage. A business whose licence is
     * genuinely gone should start its grace period; one whose licence could not be read — the
     * licence system failed to start, the owner is offline, the backend threw — must be left exactly
     * as it was.
     *
     * @param presence  see above
     * @param expiresAt epoch millis, or {@link #PERMANENT} for a licence that never lapses.
     *                  Meaningless unless {@code presence} is {@link Presence#HELD}
     */
    record LicenceSnapshot(Presence presence, long expiresAt) {

        /** A licence with no expiry. Chosen so ordinary "has it lapsed?" arithmetic just works. */
        public static final long PERMANENT = Long.MAX_VALUE;

        public enum Presence {

            /** They are carrying one. It may still have lapsed — check {@link #expiresAt}. */
            HELD,

            /** They are definitely not carrying one. */
            NOT_HELD,

            /** Nobody could look. Never a reason to change anything. */
            UNKNOWN
        }

        public static LicenceSnapshot unknown() {
            return new LicenceSnapshot(Presence.UNKNOWN, 0L);
        }

        public static LicenceSnapshot notHeld() {
            return new LicenceSnapshot(Presence.NOT_HELD, 0L);
        }

        public static LicenceSnapshot held(long expiresAt) {
            return new LicenceSnapshot(Presence.HELD, expiresAt);
        }
    }

    /**
     * Reads a licence without spending it.
     *
     * Deliberately separate from {@link #check}: that one authorises an action and may consume a
     * single-use licence, and something that merely wants to know when a licence lapses must never
     * be able to burn it. Every caller of this is a sweep or a menu.
     *
     * The default answers {@link LicenceSnapshot#unknown()}, which changes nothing — the correct
     * behaviour for a server where the licence system is not running.
     */
    default LicenceSnapshot snapshot(Player player, String licenseId) {
        return LicenceSnapshot.unknown();
    }

    /** Nothing is gated. */
    JobLicenseGate OPEN = (player, licenseId, action) -> Decision.ALLOWED;

    /**
     * Checks — and, for a consumable licence, spends — the licence for an action.
     *
     * <h2>This can consume, so call it last</h2>
     *
     * Core's licence system supports consumable licences, which are spent by the very act of being
     * used. A caller that checks the licence and then refuses the action for an unrelated reason has
     * therefore taken a single-use item and given nothing back. Every caller in this plugin runs this
     * as the final check before committing, which is why {@code JobService#claim} evaluates limits,
     * permissions and ownership first even though the licence is the cheapest thing to explain.
     *
     * @param action free text recorded against the use, e.g. {@code job-claim:miner}
     */
    Decision check(Player player, String licenseId, String action);
}
