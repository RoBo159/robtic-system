package org.robtic.minecraft.license.events;

import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.license.api.License;

import java.util.UUID;

/**
 * A player's licence was taken from them.
 *
 * Fired for a deliberate revocation rather than for dropping the item. Ownership is the item, so a
 * player who throws one away has not triggered anything the plugin needs to know about — it is
 * simply somewhere else now, and whoever picks it up owns it.
 */
public final class PlayerLoseLicenseEvent extends LicenseEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Reason reason;

    public PlayerLoseLicenseEvent(UUID playerId, License license, Reason reason) {
        super(playerId, license);
        this.reason = reason;
    }

    public Reason getReason() {
        return reason;
    }

    /** Why it was taken. */
    public enum Reason {
        /** An operator ran /license remove. */
        REVOKED,
        /** Used up by something that consumes it. */
        CONSUMED,
        /** Another plugin called the API. */
        PLUGIN
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
