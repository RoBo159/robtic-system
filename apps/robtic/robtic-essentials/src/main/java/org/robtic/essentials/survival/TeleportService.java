package org.robtic.essentials.survival;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Every teleport the survival features perform, and the return point `/back` uses.
 *
 * <h2>Why one service owns this</h2>
 *
 * `/spawn`, `/home`, `/friend tp` and `/back` all have to do the same four things: check the world
 * is loaded, remember where the player was, teleport on the main thread, and tell them. Four copies
 * of that is four chances for one of them to forget to record the return point — which is exactly
 * the bug that makes `/back` feel broken.
 *
 * The previous location is recorded here, by this service, for every teleport it performs. Nothing
 * else needs to remember to do it.
 */
public final class TeleportService {

    private final Plugin plugin;
    private final MessageCatalog messages;

    /** Where each player was before their last teleport or death. */
    private final Map<UUID, Location> returnPoints = new ConcurrentHashMap<>();

    public TeleportService(Plugin plugin, MessageCatalog messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /**
     * Teleports a player, recording where they came from. Main thread only.
     *
     * @return false when the destination's world is not loaded on this server, in which case the
     *         player has already been told and no teleport happened.
     */
    public boolean teleport(Player player, StoredLocation destination, String successKey, Object... placeholders) {
        Optional<Location> target = destination.toBukkit();

        if (target.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.world-missing", "world", destination.world()));
            return false;
        }

        remember(player);
        player.teleport(target.get());

        if (successKey != null) {
            player.sendMessage(messages.prefixed(successKey, placeholders));
        }
        return true;
    }

    /** Records a player's current position as the place `/back` returns to. */
    public void remember(Player player) {
        returnPoints.put(player.getUniqueId(), player.getLocation().clone());
    }

    /** Records an explicit location — used by the death listener, which fires before the respawn. */
    public void remember(UUID uuid, Location location) {
        returnPoints.put(uuid, location.clone());
    }

    /** Where `/back` would send this player, if anywhere. */
    public Optional<Location> returnPoint(UUID uuid) {
        return Optional.ofNullable(returnPoints.get(uuid));
    }

    /**
     * Consumes the return point.
     *
     * Taken before the teleport rather than after, so a `/back` that lands somewhere unexpected
     * cannot be repeated to bounce between two points.
     */
    public Optional<Location> takeReturnPoint(UUID uuid) {
        return Optional.ofNullable(returnPoints.remove(uuid));
    }

    public void forget(UUID uuid) {
        returnPoints.remove(uuid);
    }

    public Plugin plugin() {
        return plugin;
    }
}
