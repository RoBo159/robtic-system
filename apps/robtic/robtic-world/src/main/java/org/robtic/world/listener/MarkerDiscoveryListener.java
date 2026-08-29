package org.robtic.world.listener;

import org.bukkit.Chunk;
import org.bukkit.block.Block;
import org.bukkit.block.BlockState;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.world.StructureMarkerSystem;
import org.robtic.world.config.MarkerSettings;

import java.util.function.Supplier;

/**
 * Notices structures that BetterStructures has generated.
 *
 * <h2>Why a chunk load, and why it is not expensive</h2>
 *
 * Robtic never generates a building; it reacts to one appearing. The only reliable moment to notice
 * one is when its chunks come into memory, because a paste from another plugin fires no event this
 * one can subscribe to.
 *
 * The check that runs on every chunk load is deliberately tiny: ask the chunk for its block entities
 * and compare each one's material against the configured marker block. That is a list of a few dozen
 * at most, already in memory, with no block reads and no state loading. A chunk with no marker in it
 * — which is very nearly all of them — costs a loop over a short array and nothing else.
 *
 * A chunk that does contain a marker hands off to {@link StructureMarkerSystem#discover}, and the
 * expensive work happens exactly once per structure.
 */
public final class MarkerDiscoveryListener implements Listener {

    private final Plugin plugin;
    private final StructureMarkerSystem system;
    private final org.robtic.world.item.MarkerItemFactory items;
    private final Supplier<MarkerSettings> settings;

    public MarkerDiscoveryListener(
            Plugin plugin,
            StructureMarkerSystem system,
            org.robtic.world.item.MarkerItemFactory items,
            Supplier<MarkerSettings> settings
    ) {
        this.plugin = plugin;
        this.system = system;
        this.items = items;
        this.settings = settings;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChunkLoad(ChunkLoadEvent event) {
        MarkerSettings config = settings.get();

        if (!config.enabled() || !config.scanOnGenerate()) {
            return;
        }

        Chunk chunk = event.getChunk();

        if (!config.scans(chunk.getWorld().getName())) {
            return;
        }

        Block found = firstMarker(chunk, config);

        if (found == null) {
            return;
        }

        // Deferred a tick. A structure pasted into a chunk that is still loading may not have all of
        // its block entities in place yet, and a scan that runs half a tick early finds half a
        // building and reports it as missing its corners.
        plugin.getServer().getScheduler().runTask(plugin, () -> system.discover(found.getLocation()));
    }

    /**
     * The first genuine marker block in a chunk, or null.
     *
     * The persistent data is checked, not just the material. Skipping that check would be much
     * cheaper per block and catastrophically more expensive overall: with any sign as the marker
     * block, every village, every mineshaft and every player's shop counts as a structure and
     * triggers a full outward scan on each chunk load. The material comparison rejects almost
     * everything first, so the container read runs only for blocks that are already the right type.
     *
     * Stops at the first hit: the scan that follows searches outward from wherever it starts, so a
     * second marker in the same chunk would only ever produce the same structure twice.
     */
    private Block firstMarker(Chunk chunk, MarkerSettings config) {
        for (BlockState state : chunk.getTileEntities(false)) {
            Block block = state.getBlock();

            if (block.getType() == config.blockMaterial() && items.read(block).isPresent()) {
                return block;
            }
        }

        return null;
    }
}
