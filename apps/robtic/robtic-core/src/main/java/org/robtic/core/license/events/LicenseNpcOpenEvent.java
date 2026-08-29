package org.robtic.core.license.events;

import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;

/**
 * A player right-clicked a licence NPC and the browser is about to open.
 *
 * <h2>Not a {@link LicenseEvent}</h2>
 *
 * Every other event in this package is about one licence happening to one player. This one is about
 * neither: it is a player opening a menu that lists all of them. Forcing it into the same base would
 * mean inventing a licence for it to carry.
 *
 * <h2>Cancellable, and that is the point</h2>
 *
 * A future system that wants the NPC to do something else first — a dialogue, a reputation check, a
 * queue — cancels this and opens whatever it likes. That is the seam that keeps the licence NPC from
 * becoming the place every future feature is bolted on to.
 */
public final class LicenseNpcOpenEvent extends Event implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final int npcId;

    private boolean cancelled;

    public LicenseNpcOpenEvent(Player player, int npcId) {
        this.player = player;
        this.npcId = npcId;
    }

    public Player getPlayer() {
        return player;
    }

    /** The Citizens NPC id that was clicked. */
    public int getNpcId() {
        return npcId;
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancel) {
        this.cancelled = cancel;
    }

    public static boolean hasListeners() {
        return HANDLERS.getRegisteredListeners().length > 0;
    }

    @Override
    public @NotNull HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
