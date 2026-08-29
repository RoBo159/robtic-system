package org.robtic.jobs.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobAction;

import java.util.UUID;

/**
 * A player is about to earn job XP.
 *
 * <h2>Fires before the XP is recorded, and the amount is writable</h2>
 *
 * This is the seam every future multiplier hangs off — a premium bonus, a weekend event, the
 * reputation modifier the next phase adds. A listener changes {@link #setAmount} and the new figure
 * is what lands; cancelling awards nothing at all, and the action is not counted either.
 *
 * The level-up event is deliberately not cancellable and this one is, which is the same distinction
 * from both ends: XP is the fact, and the level is derived from it. Anything that wants to prevent
 * progress has to do it here, because by the time {@link PlayerJobLevelUpEvent} fires the XP is
 * already stored and there is nothing left to refuse.
 *
 * <h2>This is the hot path</h2>
 *
 * It fires once per rewarded action per active job — several times a second for a player mining.
 * {@code JobService} checks {@link #hasListeners()} before constructing it, so a server with nothing
 * subscribed pays a static boolean read and no allocation. A listener registered here should be
 * correspondingly cheap: no storage, no network, no scans.
 */
public final class PlayerJobXpGainEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Job job;
    private final JobAction action;
    private final long base;

    private long amount;
    private boolean cancelled;

    public PlayerJobXpGainEvent(UUID playerId, Job job, JobAction action, long amount) {
        super(playerId);
        this.job = job;
        this.action = action;
        this.base = amount;
        this.amount = amount;
    }

    public Job getJob() {
        return job;
    }

    /** What the player did to earn it, e.g. {@code break:DIAMOND_ORE}. */
    public JobAction getAction() {
        return action;
    }

    /** The configured award, before any listener touched it. */
    public long getBaseAmount() {
        return base;
    }

    /** The XP that will actually be granted. */
    public long getAmount() {
        return amount;
    }

    /**
     * Replaces the award.
     *
     * Negative values are floored at zero rather than rejected: a listener multiplying by a badly
     * configured factor should award nothing, not drain XP the player already earned.
     */
    public void setAmount(long replacement) {
        this.amount = Math.max(0L, replacement);
    }

    /** Multiplies the current amount, rounding to the nearest whole point. */
    public void multiply(double factor) {
        setAmount(Math.round(amount * Math.max(0.0d, factor)));
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancelled) {
        this.cancelled = cancelled;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }

    /** Whether anything is subscribed. Checked before this is built — see the class comment. */
    public static boolean hasListeners() {
        return HANDLERS.getRegisteredListeners().length > 0;
    }
}
