package org.robtic.dragonbattle.build;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.robtic.dragonbattle.util.Particles;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.model.Arena;

import java.util.Optional;
import java.util.Set;

/**
 * Places the victory beacon and plays it in.
 *
 * <h2>The pyramid is built, not assumed</h2>
 *
 * A beacon with no base is an inert block — no beam, no effects, and to a player it simply looks
 * broken. So the three-tier base goes down with it, which is also what makes the beam visible from
 * across the arena and gives the kill a marker players can see on their way back.
 *
 * <h2>Animated over several ticks</h2>
 *
 * Placed tier by tier rather than all at once. A structure that appears in a single frame reads as a
 * command block; one that builds upward reads as a reward, and it costs nothing but a repeating task
 * that stops on its own.
 */
public final class BeaconBuilder {

    private static final int TIERS = 3;

    private final Plugin plugin;
    private final Set<Material> whitelist;

    public BeaconBuilder(Plugin plugin, Set<Material> whitelist) {
        this.plugin = plugin;
        this.whitelist = whitelist;
    }

    /**
     * Builds the beacon at the arena's configured position.
     *
     * @return false when the arena has no beacon configured, its world is not loaded, or beacons are
     *         switched off for that arena
     */
    public boolean build(Arena arena) {
        if (!arena.settings().spawnBeacon()) {
            return false;
        }

        Optional<Location> position = arena.beacon().flatMap(location -> location.toBukkit());

        if (position.isEmpty()) {
            return false;
        }

        Location base = position.get().toBlockLocation();

        // The same replace mode the portal uses: an operator who protected their build from one
        // would not expect the other to ignore it.
        BlockPlacer placer = new BlockPlacer(arena.settings().portalReplaceMode(), whitelist);

        animate(base, placer);
        return true;
    }

    /**
     * Lays the base outward-in, one tier per few ticks, then the beacon itself.
     *
     * The widest tier goes first and each subsequent one is narrower, so the pyramid grows the way a
     * player would build it rather than appearing from the top down.
     */
    private void animate(Location base, BlockPlacer placer) {
        World world = base.getWorld();

        new org.bukkit.scheduler.BukkitRunnable() {
            int tier = TIERS;

            @Override
            public void run() {
                if (tier <= 0) {
                    finish(base, placer, world);
                    cancel();
                    return;
                }

                // Tier n sits n blocks below the beacon and extends n blocks out, which is exactly
                // the shape vanilla requires for a beacon of that power level.
                int depth = tier;
                int reach = tier;

                for (int x = -reach; x <= reach; x++) {
                    for (int z = -reach; z <= reach; z++) {
                        placer.place(base.clone().add(x, -depth, z), Material.IRON_BLOCK);
                    }
                }

                world.playSound(base, Sound.BLOCK_METAL_PLACE, 1f, 0.8f + (0.1f * tier));
                Particles.spawn(world, Particle.END_ROD, base.clone().add(0.5, 0.5, 0.5), 30, reach, 0.5, reach, 0.02);

                tier--;
            }
        }.runTaskTimer(plugin, 0L, 10L);
    }

    private void finish(Location base, BlockPlacer placer, World world) {
        placer.place(base, Material.BEACON);

        world.playSound(base, Sound.BLOCK_BEACON_ACTIVATE, 1f, 1f);
        Particles.spawn(world, Particle.END_ROD, base.clone().add(0.5, 1, 0.5), 120, 0.4, 1.5, 0.4, 0.08);
    }

    /**
     * Removes a beacon this plugin built, so the next fight starts from a clean arena.
     *
     * Sweeps exactly the pyramid {@link #build} lays down and removes only the two materials it
     * places. Anything else in that volume belongs to the arena's builder and is left standing —
     * this runs automatically on every ritual, and a clear that emptied the space outright would
     * delete part of somebody's build once per fight.
     *
     * @return how many blocks were removed
     */
    public int clear(Arena arena) {
        Optional<Location> position = arena.beacon().flatMap(location -> location.toBukkit());

        if (position.isEmpty()) {
            return 0;
        }

        Location base = position.get().toBlockLocation();
        int removed = 0;

        if (base.getBlock().getType() == Material.BEACON) {
            base.getBlock().setType(Material.AIR, false);
            removed++;
        }

        // The same tiers animate() lays: tier n sits n below and extends n out.
        for (int tier = 1; tier <= TIERS; tier++) {
            for (int x = -tier; x <= tier; x++) {
                for (int z = -tier; z <= tier; z++) {
                    Location at = base.clone().add(x, -tier, z);

                    if (at.getBlock().getType() == Material.IRON_BLOCK) {
                        at.getBlock().setType(Material.AIR, false);
                        removed++;
                    }
                }
            }
        }

        return removed;
    }
}
