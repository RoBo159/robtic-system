package org.robtic.core.geometry;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;

import java.util.Optional;

/**
 * A stored position: a world <em>name</em> and coordinates.
 *
 * <h2>Why the world is a name and not a reference</h2>
 *
 * A workplace outlives the server that created it, and the world it sits in may not be loaded when
 * the record is read — during boot, or on a server where a multiverse world is loaded lazily.
 * Holding a {@link World} would make the record unconstructible in exactly those situations, and
 * would pin an unloaded world in memory in the rest. {@link #toLocation()} returns empty when the
 * world is genuinely absent, which is a case every caller has to handle anyway.
 *
 * <h2>On duplicating {@code SurvivalModels.StoredLocation}</h2>
 *
 * This plugin already has a stored-location record, and this one is deliberately not it. The stated
 * requirement is that the progression system can be lifted into its own plugin without rewriting the
 * architecture; reusing the survival module's type would make the survival module a compile
 * dependency of every job, title and workplace, purely to share six fields. Copying a value record
 * is a smaller cost than that coupling — and unlike shared logic, a value record has nothing to
 * drift.
 *
 * @param world world name as the server knows it
 * @param x     block or precise x
 * @param y     block or precise y
 * @param z     block or precise z
 * @param yaw   facing, kept so a spawned NPC faces the way the builder intended
 * @param pitch head tilt
 */
public record WorldPoint(String world, double x, double y, double z, float yaw, float pitch) {

    public static WorldPoint of(Location location) {
        return new WorldPoint(
                location.getWorld() == null ? "" : location.getWorld().getName(),
                location.getX(), location.getY(), location.getZ(),
                location.getYaw(), location.getPitch());
    }

    /** Block-centred, for anything anchored to a block rather than standing at a precise point. */
    public static WorldPoint ofBlock(Location location) {
        return new WorldPoint(
                location.getWorld() == null ? "" : location.getWorld().getName(),
                location.getBlockX() + 0.5d, location.getBlockY(), location.getBlockZ() + 0.5d,
                0f, 0f);
    }

    /** @return empty when the world is not loaded, or the name was never valid */
    public Optional<Location> toLocation() {
        World loaded = world == null || world.isBlank() ? null : Bukkit.getWorld(world);
        return loaded == null ? Optional.empty() : Optional.of(new Location(loaded, x, y, z, yaw, pitch));
    }

    /**
     * Squared distance to another point in the same world, or empty across worlds.
     *
     * Squared rather than actual so callers comparing against a radius never pay for a square root —
     * these are checked per block-break event inside a protected area.
     */
    public Optional<Double> distanceSquaredTo(WorldPoint other) {
        if (other == null || !world.equals(other.world)) {
            return Optional.empty();
        }

        double dx = x - other.x;
        double dy = y - other.y;
        double dz = z - other.z;

        return Optional.of(dx * dx + dy * dy + dz * dz);
    }

    /** Whether a location is within a radius of this point. False across worlds. */
    public boolean within(Location location, double radius) {
        if (location.getWorld() == null || !location.getWorld().getName().equals(world)) {
            return false;
        }

        double dx = x - location.getX();
        double dy = y - location.getY();
        double dz = z - location.getZ();

        return dx * dx + dy * dy + dz * dz <= radius * radius;
    }

    public String describe() {
        return world + " " + Math.round(x) + ", " + Math.round(y) + ", " + Math.round(z);
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();
        json.addProperty("world", world);
        json.addProperty("x", x);
        json.addProperty("y", y);
        json.addProperty("z", z);
        json.addProperty("yaw", yaw);
        json.addProperty("pitch", pitch);
        return json;
    }

    public static Optional<WorldPoint> fromJson(JsonObject json) {
        if (json == null || !json.has("world")) {
            return Optional.empty();
        }

        return Optional.of(new WorldPoint(
                json.get("world").getAsString(),
                json.has("x") ? json.get("x").getAsDouble() : 0.0d,
                json.has("y") ? json.get("y").getAsDouble() : 0.0d,
                json.has("z") ? json.get("z").getAsDouble() : 0.0d,
                json.has("yaw") ? json.get("yaw").getAsFloat() : 0f,
                json.has("pitch") ? json.get("pitch").getAsFloat() : 0f));
    }
}
