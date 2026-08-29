package org.robtic.minecraft.license.events;

import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.license.api.License;

import java.util.UUID;

/**
 * A player's licence lapsed.
 *
 * Fired once, the first time the plugin notices — not repeatedly for as long as it stays expired.
 * The item is untouched and still in their inventory; only its permission has gone.
 */
public final class PlayerExpireLicenseEvent extends LicenseEvent {

    private static final HandlerList HANDLERS = new HandlerList();

    public PlayerExpireLicenseEvent(UUID playerId, License license) {
        super(playerId, license);
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
