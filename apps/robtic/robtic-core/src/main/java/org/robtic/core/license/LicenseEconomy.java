package org.robtic.core.license;

import java.util.UUID;

/**
 * Charging a player for a renewal.
 *
 * <h2>An interface, for the same reason as {@code JobEconomy}</h2>
 *
 * The licence module does not own the economy — this server's is Robs, held by the Robtic API — and
 * it should not import it either. One small interface means the module can be lifted into another
 * plugin with a different currency, and means this package has no compile dependency on the survival
 * module or the API client.
 *
 * <h2>Blocking</h2>
 *
 * Implementations talk to the API and must be called off the main thread. The renewal flow already
 * works that way: the licence is found on the tick, the payment happens on a worker, and the item is
 * rewritten on the tick afterwards.
 */
public interface LicenseEconomy {

    /** Nothing is charging. Renewals are refused rather than silently free. */
    LicenseEconomy NONE = new LicenseEconomy() {
        @Override
        public boolean charge(UUID playerId, String username, double amount, String reason) {
            return false;
        }

        @Override
        public boolean available() {
            return false;
        }
    };

    /**
     * Takes robs from a player.
     *
     * @param reason free text recorded against the transaction, e.g. {@code license-renew:miner}
     * @return whether the charge landed. False means the renewal must not happen — see
     *         {@code LicenseService#renew}, which is what makes a failed payment a no-op rather than
     *         a free renewal
     */
    boolean charge(UUID playerId, String username, double amount, String reason);

    /** Whether an economy is wired up at all, so the GUI can say so rather than failing at it. */
    default boolean available() {
        return true;
    }
}
