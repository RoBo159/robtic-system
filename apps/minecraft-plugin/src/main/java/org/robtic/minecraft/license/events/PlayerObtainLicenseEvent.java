package org.robtic.minecraft.license.events;

import org.bukkit.event.HandlerList;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.license.api.License;

import java.util.UUID;

/**
 * A player was issued a licence.
 *
 * Fired after the item is in their inventory, so a listener can rely on it being there. Cancellable
 * *before* that — see {@code LicenseService#grant}, which checks and abandons the grant rather than
 * issuing an item and then apologising.
 */
public final class PlayerObtainLicenseEvent extends LicenseEvent implements org.bukkit.event.Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private boolean cancelled;

    private final Source source;

    public PlayerObtainLicenseEvent(UUID playerId, License license, Source source) {
        super(playerId, license);
        this.source = source;
    }

    /** Where the licence came from. */
    public Source getSource() {
        return source;
    }

    /**
     * How a licence was issued.
     *
     * Open by design: a future dungeon or marketplace adds a constant here and every listener that
     * switches on it keeps compiling, because none of them are exhaustive over it.
     */
    public enum Source {
        /** An operator ran /license give. */
        ADMIN,
        /** Another plugin called the API. */
        PLUGIN,
        /** Bought or traded for. */
        PURCHASE,
        /** A reward — quest, dungeon, event. */
        REWARD
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
