package org.robtic.dragonbattle.listeners;

import org.bukkit.block.Block;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.robtic.dragonbattle.manager.ArenaManager;
import org.robtic.dragonbattle.model.Arena;

/**
 * Keeps each arena's record of player-built blocks current.
 *
 * <h2>Event-driven, never scanned</h2>
 *
 * These two events are the only thing that ever writes to a {@link org.robtic.dragonbattle.region.BuildTracker}.
 * There is no periodic sweep and no startup scan, so the cost of tracking is proportional to what
 * players actually build rather than to the size of the arena.
 *
 * <h2>MONITOR, and only after the event succeeded</h2>
 *
 * A placement another plugin cancelled did not happen, and recording it would hand the dragon a
 * block that is not there. Running last with {@code ignoreCancelled} means the record matches the
 * world rather than what somebody attempted.
 */
public final class BuildListener implements Listener {

    private final ArenaManager arenas;

    public BuildListener(ArenaManager arenas) {
        this.arenas = arenas;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        arenaAt(event.getBlock()).ifPresent(arena -> arena.builds().onPlaced(event.getBlock()));
    }

    /**
     * A player removed a block.
     *
     * Forgetting it covers the replacement case too: breaking a natural block does nothing here, and
     * whatever is placed in the hole afterwards arrives through {@link #onPlace} as the player's.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        arenaAt(event.getBlock()).ifPresent(arena -> arena.builds().onRemoved(event.getBlock()));
    }

    /**
     * The arena whose bounds contain this block, if any.
     *
     * Blocks outside every arena are ignored entirely — the tracker exists to decide what a dragon
     * may destroy, and a dragon only ever flies inside its own arena.
     */
    private java.util.Optional<Arena> arenaAt(Block block) {
        for (Arena arena : arenas.all()) {
            if (arena.bounds().map(bounds -> bounds.contains(block.getLocation())).orElse(false)) {
                return java.util.Optional.of(arena);
            }
        }

        return java.util.Optional.empty();
    }
}
