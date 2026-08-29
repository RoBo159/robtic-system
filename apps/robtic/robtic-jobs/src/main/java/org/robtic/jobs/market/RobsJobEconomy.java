package org.robtic.jobs.market;

import org.robtic.core.service.RobsService;

import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * {@link JobEconomy} backed by Robs, the server's currency.
 *
 * <h2>The one place this module learns what money is</h2>
 *
 * Everything else in the progression system charges and pays through the {@link JobEconomy}
 * interface, which knows only "credit this player this much". This class is the single adapter onto
 * {@link RobsService} — so the sell flow, the workspace upgrade and the maintenance charge all reach
 * the API through one implementation, and the rest of the package still compiles with no reference
 * to Core's economy at all.
 *
 * <h2>Sign, not two methods</h2>
 *
 * {@code JobEconomy.pay} takes a signed amount because its callers already think that way: an upgrade
 * passes {@code -cost} and a sale passes {@code +payment}. That is translated here into the credit
 * flag {@link RobsService#adjust} wants, rather than making three call sites each remember which
 * method to reach for.
 *
 * <h2>A thrown API call is a refusal, not a crash</h2>
 *
 * {@link RobsService#adjust} throws when the API is unreachable. Every caller of {@code pay} treats
 * false as "the money did not move" and undoes its half of the transaction — items go back into the
 * inventory, an upgrade is rolled back and refunded. Letting the exception escape instead would
 * abandon those callers mid-operation, which is the one outcome all of them are written to avoid,
 * so it is caught here and reported as the refusal it is.
 */
public final class RobsJobEconomy implements JobEconomy {

    private final RobsService robs;
    private final Logger logger;

    public RobsJobEconomy(RobsService robs, Logger logger) {
        this.robs = robs;
        this.logger = logger;
    }

    /**
     * Moves money. Must be called off the main thread — see {@link JobEconomy}.
     *
     * A zero amount is treated as a success without a request. Nothing is owed either way, and a
     * round trip to say so would put the sale or upgrade at the mercy of the network for no reason.
     */
    @Override
    public boolean pay(UUID playerId, String username, double amount, String reason) {
        if (org.robtic.core.util.Robs.isZero(amount)) {
            return true;
        }

        boolean credit = amount > 0.0d;

        try {
            robs.adjust(playerId, username, Math.abs(amount), credit, reason);
            return true;
        } catch (RuntimeException failure) {
            // FINE rather than WARNING: the gateway already announces an outage once instead of once
            // per request, and every caller reports the refusal to the player itself.
            logger.log(Level.FINE,
                    "A robs adjustment of " + amount + " for " + username + " (" + reason
                            + ") did not land: " + failure.getMessage(), failure);

            return false;
        }
    }

    @Override
    public boolean available() {
        return true;
    }
}
