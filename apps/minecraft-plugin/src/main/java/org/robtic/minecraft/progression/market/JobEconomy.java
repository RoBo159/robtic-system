package org.robtic.minecraft.progression.market;

import java.util.UUID;

/**
 * Paying a player for what they sold.
 *
 * <h2>An interface, for the same reason as {@code TitleDisplay}</h2>
 *
 * The progression system does not own the economy — this server's is Robs, held by the Robtic API —
 * and it should not import it either. One small interface means the sell system can be lifted into
 * another plugin with a different currency, and means this package has no compile dependency on the
 * survival module.
 *
 * <h2>Blocking</h2>
 *
 * Implementations talk to the API and must be called off the main thread. The sell flow already runs
 * that way: items are counted and removed on the tick, the payment happens on a worker, and the
 * player is told on the tick afterwards.
 */
public interface JobEconomy {

    /** Nothing is paying. Sales are refused rather than silently free. */
    JobEconomy NONE = new JobEconomy() {
        @Override
        public boolean pay(UUID playerId, String username, double amount, String reason) {
            return false;
        }

        @Override
        public boolean available() {
            return false;
        }
    };

    /**
     * Credits a player.
     *
     * @param reason free text recorded against the transaction, e.g. {@code job-sell:miner}
     * @return whether the payment landed. False means the items must be given back — see
     *         {@code SellService}, which is what makes a failed payment a no-op rather than theft
     */
    boolean pay(UUID playerId, String username, double amount, String reason);

    /** Whether an economy is wired up at all, so the GUI can hide selling instead of failing at it. */
    default boolean available() {
        return true;
    }
}
