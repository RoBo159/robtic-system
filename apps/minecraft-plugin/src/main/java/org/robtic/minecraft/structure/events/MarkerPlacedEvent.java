package org.robtic.minecraft.structure.events;

import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.robtic.minecraft.structure.api.MarkerType;

/**
 * Fired when a builder places a marker block.
 *
 * Cancellable, so a module can refuse a marker its own rules forbid — a dungeon system that allows
 * only one boss spawn per world, for example — without that rule having to live in this package.
 *
 * Cancelling restores the block and returns the item, so a refusal costs the builder nothing.
 */
public final class MarkerPlacedEvent extends Event implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();

    private final Player player;
    private final Block block;
    private final MarkerType type;

    private boolean cancelled;

    public MarkerPlacedEvent(Player player, Block block, MarkerType type) {
        this.player = player;
        this.block = block;
        this.type = type;
    }

    public Player player() {
        return player;
    }

    public Block block() {
        return block;
    }

    public MarkerType type() {
        return type;
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
