package org.robtic.world.api;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.robtic.core.geometry.WorldPoint;

import java.util.Optional;

/**
 * The cuboid two corner markers define.
 *
 * <h2>Derived, never configured</h2>
 *
 * The requirement is that no region is ever typed in by hand. A builder places an origin marker and
 * an end marker at opposite corners of what they built, and this is the box between them —
 * inclusive of both, so a marker sits inside its own region rather than one block outside it.
 *
 * <h2>The corners are normalised on construction</h2>
 *
 * Nothing asks a builder to place origin at the lower corner. They place two markers at opposite
 * ends of a building and the plugin sorts out which is which. A region built from swapped corners is
 * identical to one built from ordered corners, which removes an entire class of "it works in one
 * rotation and not the other" report.
 *
 * @param world world name, so a region in an unloaded world is still representable
 * @param minX  inclusive
 * @param minY  inclusive
 * @param minZ  inclusive
 * @param maxX  inclusive
 * @param maxY  inclusive
 * @param maxZ  inclusive
 */
public record StructureRegion(
        String world,
        int minX, int minY, int minZ,
        int maxX, int maxY, int maxZ
) {

    /**
     * Builds a region from two opposite corners, in any order.
     *
     * @return empty when the corners are in different worlds, which is the one case that cannot be
     *         normalised into a valid box
     */
    public static Optional<StructureRegion> between(WorldPoint origin, WorldPoint end) {
        if (origin == null || end == null || !origin.world().equals(end.world())) {
            return Optional.empty();
        }

        int ax = (int) Math.floor(origin.x());
        int ay = (int) Math.floor(origin.y());
        int az = (int) Math.floor(origin.z());

        int bx = (int) Math.floor(end.x());
        int by = (int) Math.floor(end.y());
        int bz = (int) Math.floor(end.z());

        return Optional.of(new StructureRegion(
                origin.world(),
                Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz),
                Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)));
    }

    public boolean contains(int x, int y, int z) {
        return x >= minX && x <= maxX
                && y >= minY && y <= maxY
                && z >= minZ && z <= maxZ;
    }

    public boolean contains(Location location) {
        return location != null
                && location.getWorld() != null
                && location.getWorld().getName().equals(world)
                && contains(location.getBlockX(), location.getBlockY(), location.getBlockZ());
    }

    public boolean contains(WorldPoint point) {
        return point != null
                && point.world().equals(world)
                && contains((int) Math.floor(point.x()),
                        (int) Math.floor(point.y()),
                        (int) Math.floor(point.z()));
    }

    /**
     * Whether two regions share any block.
     *
     * Used to refuse a structure that would sit on top of an existing one — two owners with
     * overlapping protection is a state where whoever is checked first wins, which is not a rule
     * anybody could explain to the loser.
     */
    public boolean overlaps(StructureRegion other) {
        return other != null
                && world.equals(other.world)
                && minX <= other.maxX && maxX >= other.minX
                && minY <= other.maxY && maxY >= other.minY
                && minZ <= other.maxZ && maxZ >= other.minZ;
    }

    /**
     * A copy grown outward, for a protection margin around the walls.
     *
     * Clamped at the world's build limits by the caller rather than here: this record does not know
     * which world it is in, and guessing -64..320 would be wrong for any custom world height.
     */
    public StructureRegion padded(int horizontal, int vertical) {
        int h = Math.max(0, horizontal);
        int v = Math.max(0, vertical);

        return new StructureRegion(world,
                minX - h, minY - v, minZ - h,
                maxX + h, maxY + v, maxZ + h);
    }

    public int width() {
        return maxX - minX + 1;
    }

    public int height() {
        return maxY - minY + 1;
    }

    public int length() {
        return maxZ - minZ + 1;
    }

    /** Volume in blocks. Long because a careless pair of corners can exceed an int. */
    public long volume() {
        return (long) width() * height() * length();
    }

    /** The horizontal centre at the floor, for teleports, particles and a "go here" message. */
    public Optional<Location> centre() {
        org.bukkit.World loaded = org.bukkit.Bukkit.getWorld(world);

        return loaded == null
                ? Optional.empty()
                : Optional.of(new Location(loaded,
                        (minX + maxX) / 2.0d + 0.5d, minY, (minZ + maxZ) / 2.0d + 0.5d));
    }

    public String describe() {
        return world + " " + minX + "," + minY + "," + minZ + " → " + maxX + "," + maxY + "," + maxZ
                + " (" + width() + "×" + height() + "×" + length() + ")";
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
    public static Optional<StructureRegion> fromJson(JsonObject json) {
        if (json == null || !json.has("world")) {
            return Optional.empty();
        }

        try {
            return Optional.of(new StructureRegion(
                    json.get("world").getAsString(),
                    json.get("minX").getAsInt(), json.get("minY").getAsInt(), json.get("minZ").getAsInt(),
                    json.get("maxX").getAsInt(), json.get("maxY").getAsInt(), json.get("maxZ").getAsInt()));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }
}
