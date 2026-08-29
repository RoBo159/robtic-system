package org.robtic.minecraft.progression.events;

import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.minecraft.progression.jobs.Job;

import java.util.Optional;
import java.util.UUID;

/**
 * A player is changing which of their owned jobs are active.
 *
 * <h2>Switching is not gaining or losing</h2>
 *
 * Nothing is destroyed here. A deactivated job keeps its XP, its level, its statistics and its
 * titles — it simply stops earning. That is the guarantee that makes premium's "owned versus active"
 * split reasonable rather than punishing, and it is why this is a separate event from
 * {@link PlayerGainJobEvent} and {@link PlayerLoseJobEvent} instead of a pair of them.
 *
 * A listener seeing this must not treat {@link #getDeactivated()} as a loss.
 */
public final class PlayerSwitchJobEvent extends ProgressionPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Optional<Job> activated;
    private final Optional<Job> deactivated;
    private boolean cancelled;

    /**
     * @param activated   the job starting to earn, or empty when a slot is simply being freed
     * @param deactivated the job stopping, or empty when a free slot was filled
     */
    public PlayerSwitchJobEvent(UUID playerId, Optional<Job> activated, Optional<Job> deactivated) {
        super(playerId);
        this.activated = activated;
        this.deactivated = deactivated;
    }

    public Optional<Job> getActivated() {
        return activated;
    }

    /** The job going idle. Its progress is retained in full. */
    public Optional<Job> getDeactivated() {
        return deactivated;
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
