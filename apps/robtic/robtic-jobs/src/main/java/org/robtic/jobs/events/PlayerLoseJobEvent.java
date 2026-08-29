package org.robtic.jobs.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.jobs.jobs.Job;

import java.util.UUID;

/**
 * A player is about to lose a profession, along with its XP, level, titles and workplace.
 *
 * Fired before anything is removed. A listener that wants to record what was lost — an audit log, a
 * "you can rejoin at level 1" message — reads the progress off {@link #getLevel()} here, because
 * after this event it is gone.
 */
public final class PlayerLoseJobEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Job job;
    private final int level;
    private final Reason reason;
    private boolean cancelled;

    public enum Reason {
        /** The player chose to leave. */
        RESIGNED,
        /** Removed by a command. */
        ADMIN,
        /** Removed by another plugin through the API. */
        PLUGIN
    }

    public PlayerLoseJobEvent(UUID playerId, Job job, int level, Reason reason) {
        super(playerId);
        this.job = job;
        this.level = level;
        this.reason = reason;
    }

    public Job getJob() {
        return job;
    }

    /** The level they were at when they left. Read it here; it does not exist afterwards. */
    public int getLevel() {
        return level;
    }

    public Reason getReason() {
        return reason;
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancel) {
        this.cancelled = cancel;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
