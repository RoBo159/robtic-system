package org.robtic.jobs.events;

import org.robtic.jobs.jobs.Job;

import org.bukkit.event.HandlerList;

import java.util.Map;
import java.util.UUID;

/**
 * A player sold a profession's output and was paid for it.
 *
 * <h2>Fires after the money has landed, and is not cancellable</h2>
 *
 * By the time this runs the items are gone from the inventory and the credit has been confirmed by
 * the economy. There is nothing left to refuse — "cancelling" could only mean reversing a completed
 * transaction, which is a different operation with its own failure modes and is not something an
 * arbitrary listener should be able to trigger by returning early.
 *
 * A listener that wants to *prevent* a sale has the seams to do it before this point: the per-job
 * {@code sell} conditions in {@code jobs.yml}, or the XP event that the sale also raises.
 *
 * <h2>What it carries</h2>
 *
 * The line items rather than only the total, because the systems queued behind this — collections,
 * contracts, the market analytics — care which materials moved and not just how many. The map is
 * item key to unit count, using the same keys as the job's {@code prices} section.
 */
public final class PlayerSellItemsEvent extends ProgressionPlayerEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Job job;
    private final Map<String, Integer> sold;
    private final int total;
    private final double paid;

    public PlayerSellItemsEvent(UUID playerId, Job job, Map<String, Integer> sold, double paid) {
        super(playerId);
        this.job = job;
        this.sold = Map.copyOf(sold);
        this.total = sold.values().stream().mapToInt(Integer::intValue).sum();
        this.paid = paid;
    }

    /** The profession that bought them. */
    public Job getJob() {
        return job;
    }

    /** Item key to units sold, e.g. {@code DIAMOND} → 12. Immutable. */
    public Map<String, Integer> getSold() {
        return sold;
    }

    /** How many individual items changed hands, across every line. */
    public int getTotal() {
        return total;
    }

    /** What the sale paid, in robs, already rounded to the currency's scale. */
    public double getPaid() {
        return paid;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
