package org.robtic.minecraft.progression.workspace;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.robtic.minecraft.progression.api.WorldPoint;

import java.util.Optional;

/**
 * The protected volume a workspace occupies.
 *
 * <h2>A cuboid, derived from an anchor and a radius</h2>
 *
 * The obvious alternative — recording the true extent of the building — would mean scanning it, and
 * a scan of every generated structure is the freeze this system is designed to avoid. A box around
 * the marker is a coarse approximation and the right trade: protection covering slightly more than
 * the walls costs an owner nothing, while a scan would cost every player on the server.
 *
 * A cuboid rather than a sphere because the questions asked of it are about blocks — "may this
 * player break here", "is this explosion inside" — and six integer comparisons answer that with no
 * arithmetic at all. It also matches what an operator pictures when they set a radius.
 *
 * <h2>Vertical extent is asymmetric on purpose</h2>
 *
 * Buildings extend upward far more than downward. A symmetric box either fails to cover a tower or
 * protects a pointless amount of bedrock; the depth and height are therefore configured separately
 * and default to a shallow floor and a generous ceiling.
 *
 * @param world  world name, so an unloaded world is representable
 * @param minX   inclusive
 * @param minY   inclusive
 * @param minZ   inclusive
 * @param maxX   inclusive
 * @param maxY   inclusive
 * @param maxZ   inclusive
 */
public record WorkspaceRegion(
        String world,
        int minX, int minY, int minZ,
        int maxX, int maxY, int maxZ
) {

    /**
     * Builds a region around an anchor.
     *
     * @param radius blocks outward on X and Z
     * @param depth  blocks below the anchor
     * @param height blocks above it
     */
    public static WorkspaceRegion around(WorldPoint anchor, int radius, int depth, int height) {
        int x = (int) Math.floor(anchor.x());
        int y = (int) Math.floor(anchor.y());
        int z = (int) Math.floor(anchor.z());

        int r = Math.max(0, radius);

        return new WorkspaceRegion(
                anchor.world(),
                x - r, y - Math.max(0, depth), z - r,
                x + r, y + Math.max(0, height), z + r);
    }

    public boolean contains(Location location) {
        return location != null
                && location.getWorld() != null
                && location.getWorld().getName().equals(world)
                && contains(location.getBlockX(), location.getBlockY(), location.getBlockZ());
    }

    public boolean contains(int x, int y, int z) {
        return x >= minX && x <= maxX
                && y >= minY && y <= maxY
                && z >= minZ && z <= maxZ;
    }

    /**
     * Whether two regions overlap.
     *
     * Used to refuse a claim that would sit on top of an existing workspace — two owners with
     * overlapping protection is a state where whoever is checked first wins, which is not a rule
     * anybody could explain to the loser.
     */
    public boolean overlaps(WorkspaceRegion other) {
        return other != null
                && world.equals(other.world)
                && minX <= other.maxX && maxX >= other.minX
                && minY <= other.maxY && maxY >= other.minY
                && minZ <= other.maxZ && maxZ >= other.minZ;
    }

    /** Volume in blocks, for diagnostics and for refusing an absurdly large claim. */
    public long volume() {
        return (long) (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    }

    public String describe() {
        return world + " " + minX + "," + minY + "," + minZ + " → " + maxX + "," + maxY + "," + maxZ;
    }

    /** The horizontal centre at the floor, for teleports and particle effects. */
    public Optional<Location> centre() {
        org.bukkit.World loaded = org.bukkit.Bukkit.getWorld(world);

        return loaded == null
                ? Optional.empty()
                : Optional.of(new Location(loaded,
                        (minX + maxX) / 2.0d + 0.5d, minY, (minZ + maxZ) / 2.0d + 0.5d));
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();
        json.addProperty("world", world);
        json.addProperty("minX", minX);
        json.addProperty("minY", minY);
        json.addProperty("minZ", minZ);
        json.addProperty("maxX", maxX);
        json.addProperty("maxY", maxY);
        json.addProperty("maxZ", maxZ);
        return json;
    }

    /** @return empty when a stored region is missing a field, so one bad record is skipped */
    public static Optional<WorkspaceRegion> fromJson(JsonObject json) {
        if (json == null || !json.has("world")) {
            return Optional.empty();
        }

        try {
            return Optional.of(new WorkspaceRegion(
                    json.get("world").getAsString(),
                    json.get("minX").getAsInt(), json.get("minY").getAsInt(), json.get("minZ").getAsInt(),
                    json.get("maxX").getAsInt(), json.get("maxY").getAsInt(), json.get("maxZ").getAsInt()));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }
}
