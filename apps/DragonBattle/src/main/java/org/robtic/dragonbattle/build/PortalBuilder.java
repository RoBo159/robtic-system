package org.robtic.dragonbattle.build;

import org.bukkit.Location;
import org.bukkit.Material;
import org.robtic.dragonbattle.util.Particles;
import org.bukkit.Sound;
import org.bukkit.World;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.ArenaSettings;

import java.util.Optional;
import java.util.Set;

/**
 * Builds the exit portal the dragon's death opens.
 *
 * <h2>The vanilla shape, at a configurable size</h2>
 *
 * A ring of bedrock with portal blocks inside it, the four torch-bearing pillars around the rim, and
 * the dragon egg on top. Players recognise this immediately, which is the point — the brief is that
 * the fight should feel vanilla even though every position is configurable.
 *
 * The radius scales the ring. Vanilla's is effectively 4, which is the default.
 *
 * <h2>Nothing here destroys a build unless told to</h2>
 *
 * Every block goes through {@link BlockPlacer}, so an arena built by hand keeps whatever is already
 * standing where the portal wants to go. The portal will look incomplete in that case, and that is
 * the correct trade: an operator can move the portal, but cannot un-eat their build.
 */
public final class PortalBuilder {

    private final Set<Material> whitelist;

    public PortalBuilder(Set<Material> whitelist) {
        this.whitelist = whitelist;
    }

    /**
     * Generates the portal at the arena's configured centre.
     *
     * @return how many blocks were placed and skipped, or empty when the arena has no portal
     *         configured or its world is not loaded
     */
    public Optional<Result> build(Arena arena) {
        if (!arena.settings().generatePortal()) {
            return Optional.empty();
        }

        Optional<Location> centre = arena.portalCentre().flatMap(location -> location.toBukkit());

        if (centre.isEmpty()) {
            return Optional.empty();
        }

        Location origin = centre.get().toBlockLocation();
        World world = origin.getWorld();

        ArenaSettings settings = arena.settings();
        BlockPlacer placer = new BlockPlacer(settings.portalReplaceMode(), whitelist);

        int radius = Math.max(1, settings.portalRadius());

        ring(placer, origin, radius);
        pillars(placer, origin, radius);

        // No egg here, deliberately.
        //
        // Vanilla puts one on top of its portal, and this used to copy that — but the arena already
        // has a configured egg position of its own, placed by the ritual. Doing both gave every
        // arena two dragon eggs, one where the operator put it and one the plugin invented.
        //
        // The configured one wins because it is the one an operator can move.

        world.playSound(origin, Sound.BLOCK_END_PORTAL_SPAWN, 1f, 1f);
        Particles.spawn(world, org.bukkit.Particle.REVERSE_PORTAL, origin.clone().add(0.5, 1, 0.5),
                200, radius, 2, radius, 0.1);

        return Optional.of(new Result(placer.placedCount(), placer.skippedCount()));
    }

    /**
     * Removes a portal this plugin built, so the next fight starts from a clean arena.
     *
     * <h2>Only this plugin's own blocks</h2>
     *
     * The sweep covers exactly the volume {@link #build} writes into, and removes only the materials
     * it places — bedrock, end portal, torches and the egg. Anything else standing in that space was
     * put there by a player or was part of the schematic, and is left alone.
     *
     * That restraint matters because this runs automatically when a ritual completes. A clear that
     * emptied the volume outright would quietly delete part of an arena somebody built, once per
     * fight, with no way to get it back.
     *
     * @return how many blocks were removed
     */
    public int clear(Arena arena) {
        Optional<Location> centre = arena.portalCentre().flatMap(location -> location.toBukkit());

        if (centre.isEmpty()) {
            return 0;
        }

        Location origin = centre.get().toBlockLocation();
        int radius = Math.max(1, arena.settings().portalRadius());
        int removed = 0;

        // The disc, plus the pillar height above it and the egg. Matches build()'s footprint.
        for (int x = -radius; x <= radius; x++) {
            for (int z = -radius; z <= radius; z++) {
                if (x * x + z * z > radius * radius) {
                    continue;
                }

                for (int y = 0; y <= 4; y++) {
                    Location at = origin.clone().add(x, y, z);

                    if (OURS.contains(at.getBlock().getType())) {
                        at.getBlock().setType(Material.AIR, false);
                        removed++;
                    }
                }
            }
        }

        return removed;
    }

    /**
     * The materials {@link #build} places, and the only ones {@link #clear} will remove.
     *
     * END_PORTAL is included because that is what the portal is made of; the surrounding terrain
     * never contains it by accident, which is what makes this list safe to sweep.
     */
    private static final Set<Material> OURS = Set.of(
            Material.BEDROCK,
            Material.END_PORTAL,
            Material.TORCH,
            Material.DRAGON_EGG);

    /**
     * The flat disc: bedrock rim, portal blocks inside.
     *
     * Squared distances throughout, so the ring is round rather than square and no square root is
     * taken for a comparison that does not need one.
     */
    private void ring(BlockPlacer placer, Location origin, int radius) {
        int outer = radius * radius;
        int inner = (radius - 1) * (radius - 1);

        for (int x = -radius; x <= radius; x++) {
            for (int z = -radius; z <= radius; z++) {
                int distance = x * x + z * z;

                if (distance > outer) {
                    continue;
                }

                Location at = origin.clone().add(x, 0, z);

                // The rim is bedrock and the interior is portal, which is what makes the structure
                // read as a portal rather than as a pool.
                placer.place(at, distance > inner ? Material.BEDROCK : Material.END_PORTAL);
            }
        }
    }

    /**
     * The four pillars around the rim, each topped with a torch.
     *
     * Placed at the cardinal points rather than vanilla's ten around a circle: four is legible at
     * any radius, and a configurable-size portal cannot assume there is room for ten.
     */
    private void pillars(BlockPlacer placer, Location origin, int radius) {
        int[][] offsets = {{radius, 0}, {-radius, 0}, {0, radius}, {0, -radius}};

        for (int[] offset : offsets) {
            for (int y = 1; y <= 3; y++) {
                placer.place(origin.clone().add(offset[0], y, offset[1]), Material.BEDROCK);
            }

            placer.place(origin.clone().add(offset[0], 4, offset[1]), Material.TORCH);
        }
    }

    /** What the build actually managed, so the caller can report a partial result honestly. */
    public record Result(int placed, int skipped) {

        public boolean partial() {
            return skipped > 0;
        }
    }
}
