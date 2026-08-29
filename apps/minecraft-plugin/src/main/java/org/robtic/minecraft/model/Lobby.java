package org.robtic.minecraft.model;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Player;

/**
 * A teleport destination offered by the staff lobby menu.
 *
 * The location is resolved on demand rather than held, because a world provided by a multiverse
 * plugin may load after this plugin enables — resolving at parse time would permanently break an
 * otherwise valid destination.
 */
public record Lobby(
        String id,
        String displayName,
        String worldName,
        double x,
        double y,
        double z,
        float yaw,
        float pitch,
        String permission,
        Material icon,
        int slot
) {

    /** Null when the named world is not loaded, which the menu renders as unavailable. */
    public Location toLocation() {
        World world = Bukkit.getWorld(worldName);
        return world == null ? null : new Location(world, x, y, z, yaw, pitch);
    }

    /** A destination with no configured permission is available to every staff member. */
    public boolean isVisibleTo(Player player) {
        return permission == null || permission.isBlank() || player.hasPermission(permission);
    }
}
