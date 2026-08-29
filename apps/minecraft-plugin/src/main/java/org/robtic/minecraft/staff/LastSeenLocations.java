package org.robtic.minecraft.staff;

import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Where each player was standing when they last disconnected.
 *
 * <h2>Why this exists at all</h2>
 *
 * A report names a player who is very often no longer here — somebody grieves a base and logs off,
 * and the report is filed a minute later. Staff reading that report want to know where it happened,
 * and Bukkit offers no way to ask an {@link org.bukkit.OfflinePlayer} where it was: the position is
 * inside the player data file the server owns, and it is not exposed.
 *
 * So the position is remembered on the way out. It costs one map write per disconnect.
 *
 * <h2>Memory only, and deliberately so</h2>
 *
 * This is lost on restart, and that is the right trade. The value is only interesting for somebody
 * who left recently — a coordinate from three weeks ago tells a staff member nothing about the
 * incident being reported — and persisting it would mean a file that grows with every player who
 * has ever played, written on every quit, to answer a question that stops being asked within
 * minutes. Where the answer is missing the report simply says so.
 */
public final class LastSeenLocations {

    /** How many positions to keep. Far more than any report will reach back for. */
    private static final int CAPACITY = 500;

    private final Map<UUID, Location> locations = new ConcurrentHashMap<>();

    /** Records where a player was. Called on disconnect, on the main thread. */
    public void record(Player player) {
        // Cloned: a Location handed out by Bukkit is a live view of the entity's position, and
        // keeping the original would mutate under us — or pin the player object after they leave.
        locations.put(player.getUniqueId(), player.getLocation().clone());

        // Unbounded growth on a busy server is the only real cost here, and the oldest entry is
        // also the least useful one, so the map is trimmed rather than allowed to accumulate.
        if (locations.size() > CAPACITY) {
            locations.keySet().stream().findFirst().ifPresent(locations::remove);
        }
    }

    /** Where a player was last seen, if this server has seen them leave since it started. */
    public Optional<Location> of(UUID uuid) {
        return Optional.ofNullable(locations.get(uuid));
    }

    /** Dropped when a player comes back — their live position supersedes it. */
    public void forget(UUID uuid) {
        locations.remove(uuid);
    }
}
