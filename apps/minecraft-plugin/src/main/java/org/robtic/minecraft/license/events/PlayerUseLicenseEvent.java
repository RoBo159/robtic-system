package org.robtic.minecraft.license.events;

import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.license.api.License;

import java.util.UUID;

/**
 * A player used a licence to do something.
 *
 * Fired by whichever system consulted it — a workspace claim, a marketplace listing — rather than by
 * this module, which has no idea what a licence is for. Cancellable, so a listener can refuse an
 * action a licence would otherwise have permitted.
 */
public final class PlayerUseLicenseEvent extends LicenseEvent implements org.bukkit.event.Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private boolean cancelled;

    private final String action;

    public PlayerUseLicenseEvent(UUID playerId, License license, String action) {
        super(playerId, license);
        this.action = action;
    }

    /**
     * What the licence was used for, in the caller's own words.
     *
     * A free string rather than an enum: this module cannot enumerate what future systems will do
     * with a licence, and an enum would make each of them an edit here.
     */
    public String getAction() {
        return action;
    }

    @Override
    public boolean isCancelled() {
        return cancelled;
    }

    @Override
    public void setCancelled(boolean cancel) {
        this.cancelled = cancel;
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
