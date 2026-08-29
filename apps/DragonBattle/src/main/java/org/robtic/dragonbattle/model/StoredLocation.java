package org.robtic.dragonbattle.model;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.configuration.ConfigurationSection;

import java.util.Optional;

/**
 * A position, stored by world <em>name</em> rather than by reference.
 *
 * A Bukkit {@link Location} holds a live {@link World}, which pins an unloaded world in memory and
 * is meaningless once the server has dropped it. An arena is configured once and read for the life
 * of the server — often before its world has finished loading — so the reference is resolved at the
 * moment of use and the absence of a world is a normal answer rather than a crash.
 */
public record StoredLocation(String world, double x, double y, double z, float yaw, float pitch) {

    public static StoredLocation of(Location location) {
        return new StoredLocation(
                location.getWorld().getName(),
                location.getX(),
                location.getY(),
                location.getZ(),
                location.getYaw(),
                location.getPitch());
    }

    /** The live location, or empty when that world is not loaded on this server. */
    public Optional<Location> toBukkit() {
        World resolved = Bukkit.getWorld(world);
        return resolved == null
                ? Optional.empty()
                : Optional.of(new Location(resolved, x, y, z, yaw, pitch));
    }

    /** The centre of the block this sits in, which is what a dragon should be aimed at. */
    public Optional<Location> toBlockCentre() {
        return toBukkit().map(location -> location.toBlockLocation().add(0.5, 0, 0.5));
    }

    public void write(ConfigurationSection section) {
        section.set("world", world);
        section.set("x", x);
        section.set("y", y);
        section.set("z", z);
        section.set("yaw", yaw);
        section.set("pitch", pitch);
    }

    /** Reads a stored position, or null when the section is absent or names no world. */
    public static StoredLocation read(ConfigurationSection section) {
        if (section == null) {
            return null;
        }

        String world = section.getString("world", "");
        if (world.isBlank()) {
            return null;
        }

        return new StoredLocation(
                world,
                section.getDouble("x"),
                section.getDouble("y"),
                section.getDouble("z"),
                (float) section.getDouble("yaw"),
                (float) section.getDouble("pitch"));
    }

    /** A short human-readable form, for `/dragonbattle list` and command feedback. */
    public String describe() {
        return world + " " + Math.round(x) + ", " + Math.round(y) + ", " + Math.round(z);
    }
}
