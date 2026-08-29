package org.robtic.world.scan;

import org.bukkit.Chunk;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockState;
import org.robtic.world.api.MarkerProblem;
import org.robtic.world.api.MarkerSet;
import org.robtic.world.api.PlacedMarker;
import org.robtic.world.api.StructureRegion;
import org.robtic.world.config.MarkerSettings;
import org.robtic.world.item.MarkerItemFactory;
import org.robtic.world.validate.MarkerValidator;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Reads markers out of the world.
 *
 * <h2>Scanning tile entities, not blocks</h2>
 *
 * The obvious implementation walks every block in a box and asks what it is. For the default search
 * radius that is roughly nine hundred thousand block reads on the main thread, per structure, and it
 * is exactly the freeze this system exists to avoid.
 *
 * Instead the scan asks each overlapping chunk for its tile entities. A marker has to have a tile
 * entity in order to carry its data at all — see {@link MarkerItemFactory} — so every marker is in
 * that list, and the list is a few dozen entries per chunk rather than sixty-five thousand. The scan
 * is therefore proportional to how much furniture is in the building, not to how big the search box
 * is.
 *
 * <h2>When this runs</h2>
 *
 * Three moments, and no others: a structure is generated, a structure is registered by hand, or
 * somebody runs validation. Nothing about normal gameplay touches this class — a player walking
 * through a claimed workspace causes no scanning, because everything that was ever going to be read
 * has already been read and persisted into a {@link MarkerSet}.
 *
 * <h2>Chunk loading</h2>
 *
 * The scan loads any chunk in range that is not already loaded. At the default radius that is at
 * most sixty-four chunks, and in the case this was written for — a structure that has just been
 * pasted — they are loaded already. A larger radius costs proportionally more, which is why the
 * setting is clamped.
 */
public final class StructureScanner {

    private final MarkerItemFactory items;
    private final MarkerValidator validator;
    private final Supplier<MarkerSettings> settings;

    public StructureScanner(
            MarkerItemFactory items,
            MarkerValidator validator,
            Supplier<MarkerSettings> settings
    ) {
        this.items = items;
        this.validator = validator;
        this.settings = settings;
    }

    /**
     * Scans a box around a point, then works out the structure from what it finds.
     *
     * This is the entry point for both generation and validation: neither knows where the structure
     * begins, only that there is one somewhere near a marker that was noticed.
     */
    public ScanReport scanAround(Location centre, int radius) {
        if (centre == null || centre.getWorld() == null) {
            return ScanReport.empty();
        }

        int r = Math.max(1, radius);

        StructureRegion search = new StructureRegion(
                centre.getWorld().getName(),
                centre.getBlockX() - r, worldFloor(centre.getWorld(), centre.getBlockY() - r),
                centre.getBlockZ() - r,
                centre.getBlockX() + r, worldCeiling(centre.getWorld(), centre.getBlockY() + r),
                centre.getBlockZ() + r);

        return report(collect(centre.getWorld(), search));
    }

    /** Scans a known region, for re-validating a structure whose extent is already recorded. */
    public ScanReport scanRegion(StructureRegion region) {
        World world = org.bukkit.Bukkit.getWorld(region.world());

        return world == null ? ScanReport.empty() : report(collect(world, region));
    }

    // ─── Collecting ───────────────────────────────────────────────────────────────────────────

    /**
     * Every marker inside a box.
     *
     * The material check comes before the container read, because a chunk full of chests should cost
     * one enum comparison each rather than one persistent-data lookup each.
     */
    private List<PlacedMarker> collect(World world, StructureRegion box) {
        MarkerSettings config = settings.get();
        List<PlacedMarker> found = new ArrayList<>();

        int minChunkX = box.minX() >> 4;
        int maxChunkX = box.maxX() >> 4;
        int minChunkZ = box.minZ() >> 4;
        int maxChunkZ = box.maxZ() >> 4;

        for (int chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
            for (int chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
                Chunk chunk = world.getChunkAt(chunkX, chunkZ);

                for (BlockState state : chunk.getTileEntities(false)) {
                    Block block = state.getBlock();

                    if (block.getType() != config.blockMaterial()) {
                        continue;
                    }

                    if (!box.contains(block.getX(), block.getY(), block.getZ())) {
                        continue;
                    }

                    items.read(block).ifPresent(found::add);
                }
            }
        }

        return found;
    }

    /**
     * Turns raw markers into a validated report.
     *
     * The region is derived first, because almost every other check is expressed relative to it, and
     * a set is only produced when nothing fatal came back. That ordering is what makes
     * {@link ScanReport#ok()} a single question with a single answer.
     */
    private ScanReport report(List<PlacedMarker> markers) {
        if (markers.isEmpty()) {
            return ScanReport.empty();
        }

        Optional<StructureRegion> region = validator.regionOf(markers);

        List<MarkerProblem> problems =
                validator.validate(markers, region, settings.get().maxVolume());

        boolean fatal = problems.stream().anyMatch(MarkerProblem::isFatal);

        Optional<MarkerSet> set = fatal || region.isEmpty()
                ? Optional.empty()
                : Optional.of(MarkerSet.of(region.get(), markers));

        return new ScanReport(markers, region, problems, set);
    }

    // ─── Clearing ─────────────────────────────────────────────────────────────────────────────

    /**
     * Replaces the marker blocks with something invisible, now that they have been read.
     *
     * This is the step that makes a marker "invisible during gameplay". Everything the markers said
     * is already in the {@link MarkerSet} the caller is holding, so nothing is lost by removing
     * them — and quite a lot is gained, because a marker that is not a block cannot be broken,
     * stolen, or rotated by a player standing in the building.
     *
     * Physics are suppressed. A marker in mid-air is normal, and a physics update would turn the
     * block being removed into a cascade that pops any neighbouring markers off as items.
     *
     * @return how many blocks were actually cleared
     */
    public int clear(MarkerSet set) {
        MarkerSettings config = settings.get();

        if (config.keepBlocks()) {
            return 0;
        }

        World world = org.bukkit.Bukkit.getWorld(set.region().world());

        if (world == null) {
            return 0;
        }

        int cleared = 0;

        for (PlacedMarker marker : set.markers()) {
            Block block = world.getBlockAt(marker.blockX(), marker.blockY(), marker.blockZ());

            if (block.getType() == config.blockMaterial()) {
                block.setType(config.clearedMaterial(), false);
                cleared++;
            }
        }

        return cleared;
    }

    // ─── World limits ─────────────────────────────────────────────────────────────────────────
    //
    // A search box is built by adding a radius to a point, which can easily fall outside the world.
    // Clamping here rather than in StructureRegion keeps that record free of any assumption about
    // world height, which is not fixed and is not something a value object can know.

    private static int worldFloor(World world, int y) {
        return Math.max(world.getMinHeight(), y);
    }

    private static int worldCeiling(World world, int y) {
        return Math.min(world.getMaxHeight() - 1, y);
    }
}
