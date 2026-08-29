package org.robtic.minecraft.progression.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.minecraft.progression.jobs.Job;

import java.util.UUID;

/**
 * A player is about to take up a profession.
 *
 * Fired after every validation has passed but before anything is written, so a listener cancelling
 * it leaves no trace: no job, no workplace, no titles, no statistics. That ordering is what makes
 * the claim safe to veto — a listener that had to undo a half-completed claim would have to know
 * about all five of those systems.
 *
 * @see PlayerSwitchJobEvent for activating a job already owned, which is a different thing
 */
public final class PlayerGainJobEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Job job;
    private final Source source;
    private boolean cancelled;

    /** How the job was acquired, so listeners can treat a discovery differently from an admin grant. */
    public enum Source {
        /** Claimed from a recruitment NPC at a discovered structure — the intended path. */
        RECRUITMENT_NPC,
        /** Granted by a command. */
        ADMIN,
        /** Granted by another plugin through the API. */
        PLUGIN
    }

    public PlayerGainJobEvent(UUID playerId, Job job, Source source) {
        super(playerId);
        this.job = job;
        this.source = source;
    }

    public Job getJob() {
        return job;
    }

    public Source getSource() {
        return source;
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
