package org.robtic.core.service;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.cache.BalanceCache;
import org.robtic.core.config.MessageCatalog;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Brings the server back into agreement with the API after an outage.
 *
 * The ordering is the whole of it:
 *
 * <ol>
 *   <li><b>Drain the queue first.</b> Every credit earned offline has to reach the API before any
 *       balance is read back, or the read returns a figure that predates those sales and the
 *       player appears to have lost the robs they watched themselves earn.</li>
 *   <li><b>Then re-read balances</b> for everyone carrying a pending credit. The returned figure
 *       already includes the replayed sales, so the pending total is cleared rather than added —
 *       that is what stops the reconnect double-counting.</li>
 *   <li><b>Then refresh profiles</b>, so a role change made during the outage takes effect.</li>
 * </ol>
 *
 * A resync that fails part-way is safe to repeat: the queue is idempotent and the balance read is
 * a read, so the retry timer simply tries again on the next tick.
 */
public final class ResyncService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final RobsService robs;
    private final PlayerDataService players;
    private final PriceService prices;
    private final BalanceCache balances;
    private final MessageCatalog messages;
    private final Logger logger;

    /** Guards against two resyncs overlapping while the first is still draining the queue. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public ResyncService(
            Plugin plugin,
            ApiGateway gateway,
            RobsService robs,
            PlayerDataService players,
            PriceService prices,
            BalanceCache balances,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.robs = robs;
        this.players = players;
        this.prices = prices;
        this.balances = balances;
        this.messages = messages;
        this.logger = plugin.getLogger();
    }

    /**
     * Runs a full resync. Must run off the main thread.
     *
     * Called when the gateway observes the API coming back, and harmless to call when nothing is
     * actually pending — it exits immediately in that case.
     */
    public void run() {
        if (!running.compareAndSet(false, true)) {
            return;
        }

        try {
            int queued = gateway.queue().size();

            if (queued > 0) {
                logger.info("Reconnected to the Robtic API — replaying " + queued + " queued request(s).");

                // Drained in a loop rather than one batch: the flush handles a fixed number of
                // entries per pass, and a long outage can leave far more than that.
                int delivered;
                do {
                    delivered = gateway.queue().flush(gateway.client());
                } while (delivered > 0 && gateway.queue().size() > 0);

                if (gateway.queue().size() > 0) {
                    logger.warning("Resync incomplete — " + gateway.queue().size()
                            + " request(s) still queued. Will retry.");
                    return;
                }
            }

            reconcileBalances();
            refreshProfiles();
            prices.invalidate();

            if (queued > 0) {
                logger.info("Resync complete — every queued request was accepted by the API.");
            }
        } catch (RuntimeException error) {
            logger.log(Level.WARNING, "Resync failed; it will be retried", error);
        } finally {
            running.set(false);
        }
    }

    /**
     * Re-reads the balance of everyone carrying a pending credit.
     *
     * Reading through {@link RobsService#balance} is deliberate: that method reconciles the
     * cache as a side effect, so the pending total is cleared by the same call that fetches the
     * authoritative figure and the two cannot drift apart.
     */
    private void reconcileBalances() {
        for (UUID uuid : balances.playersWithPending()) {
            try {
                RobsService.Balance balance = robs.balance(uuid);
                notifyIfOnline(uuid, balance.robs());
            } catch (ApiException error) {
                logger.fine("Could not reconcile the balance for " + uuid + ": " + error.getMessage());
            }
        }
    }

    /** Tells a player their offline earnings landed, so the outage has a visible resolution. */
    private void notifyIfOnline(UUID uuid, double robs) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null && player.isOnline()) {
                player.sendMessage(messages.prefixed("robs.synced", "robs", org.robtic.core.util.Robs.format(robs)));
            }
        });
    }

    /** Drops cached profiles so the next read reflects any role change made during the outage. */
    private void refreshProfiles() {
        for (Player online : Bukkit.getOnlinePlayers()) {
            players.invalidate(online.getUniqueId());
        }
    }
}
