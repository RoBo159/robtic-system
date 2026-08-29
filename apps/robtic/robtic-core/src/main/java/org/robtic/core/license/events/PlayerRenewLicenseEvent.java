package org.robtic.core.license.events;

import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.license.api.License;

import java.util.UUID;

/**
 * A player renewed a licence at the licence NPC.
 *
 * Fired after the payment has landed and the item has been rewritten, so the new expiry is already
 * true by the time a listener reads it.
 */
public final class PlayerRenewLicenseEvent extends LicenseEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    private final double cost;
    private final long newExpiry;

    public PlayerRenewLicenseEvent(UUID playerId, License license, double cost, long newExpiry) {
        super(playerId, license);
        this.cost = cost;
        this.newExpiry = newExpiry;
    }

    /** What the player paid, in robs. */
    public double getCost() {
        return cost;
    }

    /** Epoch millis the licence now lapses. */
    public long getNewExpiry() {
        return newExpiry;
    }

    /** Whether anything is listening, so a caller can skip building an event nobody wants. */
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
