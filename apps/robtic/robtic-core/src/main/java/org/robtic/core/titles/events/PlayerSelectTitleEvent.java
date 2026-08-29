package org.robtic.core.titles.events;

import org.robtic.core.event.RobticPlayerEvent;
import org.bukkit.event.Cancellable;
import org.bukkit.event.HandlerList;
import org.robtic.core.titles.Title;

import java.util.Optional;
import java.util.UUID;

/**
 * A player is about to change which title they are wearing.
 *
 * Covers taking one off as well as putting one on: {@link #getTitle()} is empty when the player is
 * clearing their selection. One event for both because every listener that cares — the LuckPerms
 * display hook above all — has to react to both, and splitting them would guarantee that a listener
 * eventually handles one and forgets the other, leaving a stale prefix on a player who unequipped.
 *
 * Cancelling leaves the previously worn title in place and the storage untouched.
 */
public final class PlayerSelectTitleEvent extends RobticPlayerEvent implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Optional<Title> title;
    private final Optional<Title> previous;
    private boolean cancelled;

    public PlayerSelectTitleEvent(UUID playerId, Optional<Title> title, Optional<Title> previous) {
        super(playerId);
        this.title = title;
        this.previous = previous;
    }

    /** The title being put on, or empty when the player is clearing their selection. */
    public Optional<Title> getTitle() {
        return title;
    }

    /** What they were wearing beforehand, so a display hook knows what to remove. */
    public Optional<Title> getPrevious() {
        return previous;
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
