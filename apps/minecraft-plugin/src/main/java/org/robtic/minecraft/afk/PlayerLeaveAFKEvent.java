package org.robtic.minecraft.afk;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * Fired after a player has left AFK and been restored.
 *
 * Deliberately not cancellable. By the time it fires the player has already been put back, and a
 * veto would leave them in the lobby with no saved location to return to — the one outcome this
 * system exists to prevent. Listeners observe; they do not decide.
 *
 * Always fired on the main thread.
 */
public final class PlayerLeaveAFKEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final Location restoredTo;
    private final long afkMillis;

    public PlayerLeaveAFKEvent(Player player, Location restoredTo, long afkMillis) {
        this.player = player;
        this.restoredTo = restoredTo;
        this.afkMillis = afkMillis;
    }

    public Player getPlayer() {
        return player;
    }

    /** Where the player was put back, or null when the saved location could not be honoured. */
    public Location getRestoredTo() {
        return restoredTo;
    }

    /** How long they were AFK, for statistics and reward modules. */
    public long getAfkMillis() {
        return afkMillis;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
