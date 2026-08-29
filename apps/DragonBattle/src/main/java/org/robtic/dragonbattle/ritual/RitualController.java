package org.robtic.dragonbattle.ritual;

import org.bukkit.Location;
import org.bukkit.entity.EnderCrystal;
import org.bukkit.entity.Entity;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.List;
import java.util.Optional;

/**
 * Decides whether the respawn ritual is complete.
 *
 * <h2>The configured positions are the requirement</h2>
 *
 * There is no "crystals needed" setting. However many positions an operator added is how many
 * crystals must be present — which is what removes vanilla's limit of four without introducing a
 * second number that could disagree with the first. One position means one crystal; twelve means
 * twelve.
 *
 * <h2>Presence, not placement</h2>
 *
 * The check asks whether a crystal <em>is</em> at each position, rather than counting placement
 * events. That way a crystal destroyed mid-ritual un-completes it, a server restart loses nothing,
 * and a crystal placed by any means — a player, a command, another plugin — counts the same.
 */
public final class RitualController {

    /** How close a crystal must be to a configured position to satisfy it. */
    private static final double TOLERANCE = 1.5;

    /**
     * Whether every configured position currently holds a crystal.
     *
     * False for an arena with no positions configured: an empty requirement would otherwise be
     * trivially satisfied and start a battle the moment the arena was created.
     */
    public boolean complete(Arena arena) {
        if (arena.crystals().isEmpty()) {
            return false;
        }

        return arena.crystals().stream().allMatch(this::occupied);
    }

    /** How many of the arena's positions currently hold a crystal, for progress messages. */
    public int placed(Arena arena) {
        return (int) arena.crystals().stream().filter(this::occupied).count();
    }

    /** Whether a crystal is standing at this position. */
    public boolean occupied(StoredLocation position) {
        Optional<Location> location = position.toBukkit();

        if (location.isEmpty()) {
            return false;
        }

        Location where = location.get();

        // A chunk that is not loaded holds no entities as far as Bukkit is concerned, so asking
        // would report "no crystal" for a position that has one. Treated as unknown-and-therefore-
        // absent, which is the safe direction: the worst case is a ritual that waits.
        if (!where.getChunk().isLoaded()) {
            return false;
        }

        return where.getWorld()
                .getNearbyEntities(where, TOLERANCE, TOLERANCE, TOLERANCE)
                .stream()
                .anyMatch(entity -> entity instanceof EnderCrystal && entity.isValid());
    }

    /** The crystals sitting on the arena's positions, for the ritual animation to consume. */
    public List<EnderCrystal> crystalsOn(Arena arena) {
        return arena.crystals().stream()
                .map(StoredLocation::toBukkit)
                .flatMap(Optional::stream)
                .filter(location -> location.getChunk().isLoaded())
                .flatMap(location -> location.getWorld()
                        .getNearbyEntities(location, TOLERANCE, TOLERANCE, TOLERANCE)
                        .stream())
                .filter(EnderCrystal.class::isInstance)
                .filter(Entity::isValid)
                .map(EnderCrystal.class::cast)
                .toList();
    }
}
