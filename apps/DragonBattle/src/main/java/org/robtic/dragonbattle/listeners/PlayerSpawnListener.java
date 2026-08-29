package org.robtic.dragonbattle.listeners;

import org.bukkit.Location;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerPortalEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.robtic.dragonbattle.manager.ArenaManager;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.Optional;

/**
 * Puts players where the arena says they should arrive.
 *
 * <h2>Two ways in, one destination</h2>
 *
 * A player reaches an arena's world either through a portal or by respawning in it after dying to
 * the dragon. Both should land them at the configured player spawn — vanilla's own obsidian platform
 * is the wrong place when the arena is somewhere else entirely, and a player who dies mid-fight
 * should return to the entrance rather than to wherever the server would otherwise put them.
 *
 * <h2>Only worlds an arena claims</h2>
 *
 * Every handler resolves the destination world back to a configured arena first. A server running
 * this plugin alongside a normal End keeps that End's behaviour untouched.
 */
public final class PlayerSpawnListener implements Listener {

    private final ArenaManager arenas;

    public PlayerSpawnListener(ArenaManager arenas) {
        this.arenas = arenas;
    }

    /**
     * Entering an arena's world through a portal.
     *
     * HIGH rather than MONITOR: the destination is being changed, so this has to run before the
     * server acts on it, and after any plugin with a stronger claim has had its say.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPortal(PlayerPortalEvent event) {
        Location destination = event.getTo();

        if (destination == null || destination.getWorld() == null) {
            return;
        }

        spawnFor(destination.getWorld().getName()).ifPresent(event::setTo);
    }

    /** Respawning after dying inside an arena. */
    @EventHandler(priority = EventPriority.HIGH)
    public void onRespawn(PlayerRespawnEvent event) {
        // A player with a bed or anchor has chosen where they respawn, and overriding that would be
        // taking away a decision they made deliberately.
        if (event.isBedSpawn() || event.isAnchorSpawn()) {
            return;
        }

        String world = event.getPlayer().getWorld().getName();

        spawnFor(world).ifPresent(event::setRespawnLocation);
    }

    /** The configured player spawn for whichever arena claims this world. */
    private Optional<Location> spawnFor(String world) {
        for (Arena arena : arenas.all()) {
            if (!arena.enabled()) {
                continue;
            }

            Optional<StoredLocation> spawn = arena.playerSpawn();

            if (spawn.isPresent() && spawn.get().world().equals(world)) {
                return spawn.get().toBukkit();
            }
        }

        return Optional.empty();
    }
}
