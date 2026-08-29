package org.robtic.dragonbattle.model;

import org.bukkit.Location;
import org.bukkit.configuration.ConfigurationSection;

import java.util.List;

/**
 * An axis-aligned cuboid, used for safe and breakable regions.
 *
 * <h2>Why a plain cuboid and not a WorldGuard dependency</h2>
 *
 * The only question this plugin ever asks a region is "is this block inside you?", asked on every
 * block the dragon would break. A cuboid answers that with six comparisons and no plugin
 * dependency, and an operator selecting two corners is a workflow they already know. Anything
 * richer — polygons, priorities, flags — would be a region system competing with the one the server
 * already runs.
 *
 * Corners are normalised at construction, so a region selected from either direction behaves the
 * same.
 */
public record Region(String world, int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {

    public static Region between(Location first, Location second) {
        return new Region(
                first.getWorld().getName(),
                Math.min(first.getBlockX(), second.getBlockX()),
                Math.min(first.getBlockY(), second.getBlockY()),
                Math.min(first.getBlockZ(), second.getBlockZ()),
                Math.max(first.getBlockX(), second.getBlockX()),
                Math.max(first.getBlockY(), second.getBlockY()),
                Math.max(first.getBlockZ(), second.getBlockZ()));
    }

    public boolean contains(Location location) {
        return location.getWorld() != null
                && location.getWorld().getName().equals(world)
                && contains(location.getBlockX(), location.getBlockY(), location.getBlockZ());
    }

    public boolean contains(int x, int y, int z) {
        return x >= minX && x <= maxX
                && y >= minY && y <= maxY
                && z >= minZ && z <= maxZ;
    }

    /**
     * Whether a location is within the region's footprint, ignoring height entirely.
     *
     * <h2>Why height has to be ignored for the dragon</h2>
     *
     * An operator selects the arena by standing at two corners on the ground, so the region's
     * {@code maxY} is roughly the top of the build. A dragon flies far above that — which means the
     * full {@link #contains} test calls a perfectly well-behaved dragon "outside" on essentially
     * every tick of every fight.
     *
     * That is a containment test answering the wrong question. "Is the dragon over the arena?" is a
     * question about X and Z; the answer must not change because it gained altitude.
     *
     * The three-dimensional test is still the right one for blocks, which is what it is used for.
     */
    public boolean containsHorizontally(Location location) {
        return location.getWorld() != null
                && location.getWorld().getName().equals(world)
                && location.getBlockX() >= minX && location.getBlockX() <= maxX
                && location.getBlockZ() >= minZ && location.getBlockZ() <= maxZ;
    }

    public void write(ConfigurationSection section) {
        section.set("world", world);
        section.set("min", List.of(minX, minY, minZ));
        section.set("max", List.of(maxX, maxY, maxZ));
    }

    public static Region read(ConfigurationSection section) {
        if (section == null) {
            return null;
        }

        String world = section.getString("world", "");
        List<Integer> min = section.getIntegerList("min");
        List<Integer> max = section.getIntegerList("max");

        if (world.isBlank() || min.size() != 3 || max.size() != 3) {
            return null;
        }

        return new Region(world,
                Math.min(min.get(0), max.get(0)), Math.min(min.get(1), max.get(1)), Math.min(min.get(2), max.get(2)),
                Math.max(min.get(0), max.get(0)), Math.max(min.get(1), max.get(1)), Math.max(min.get(2), max.get(2)));
    }

    public String describe() {
        return world + " [" + minX + "," + minY + "," + minZ + " → " + maxX + "," + maxY + "," + maxZ + "]";
    }
}
