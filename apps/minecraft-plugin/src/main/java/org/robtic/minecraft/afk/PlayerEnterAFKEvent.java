package org.robtic.minecraft.afk;

import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired just before a player is moved to the AFK lobby.
 *
 * Cancellable, and cancelling is a real veto: the player keeps their position, stays out of the AFK
 * set, and their activity clock is reset so the same decision is not re-made a tick later. That is
 * what lets another Robtic module exempt someone mid-event or mid-duel without this service needing
 * to know those concepts exist.
 *
 * Always fired on the main thread.
 */
public final class PlayerEnterAFKEvent extends Event implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final boolean voluntary;
    private boolean cancelled;

    /**
     * @param voluntary true when the player ran {@code /afk} themselves, false when the inactivity
     *                  timer moved them. Listeners that reward AFK time generally care about the
     *                  difference.
     */
    public PlayerEnterAFKEvent(Player player, boolean voluntary) {
        this.player = player;
        this.voluntary = voluntary;
    }

    public Player getPlayer() {
        return player;
    }

    public boolean isVoluntary() {
        return voluntary;
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
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
