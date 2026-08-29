package org.robtic.minecraft.auth;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Where an unauthenticated player stands, and where they end up once they are in.
 *
 * <h2>Separate from the restrictions</h2>
 *
 * {@link AuthRestrictionListener} decides what a player may *do*; this decides where they *are*.
 * Keeping them apart means the link world can be reconfigured, or switched off entirely, without
 * touching the rules that make an unverified player harmless — and an operator who has not created
 * a link world still gets every restriction.
 *
 * <h2>The return location is captured before anything moves them</h2>
 *
 * Exactly as {@code AfkSnapshot} does, and for the same reason: the server saves a player wherever
 * they happen to be at logout, so a player who quits at the link world's spawn would otherwise be
 * moved there permanently. It is captured on join, before the teleport, and honoured on
 * authentication.
 *
 * A player sent to the link world is *not* returned to where they joined, though — they joined
 * unlinked, which for a first-time player is a spawn point they have never seen. They go to the
 * world spawn instead. Only somebody who was already somewhere real gets put back.
 */
public final class AuthPlacementListener implements Listener {

    private final Plugin plugin;
    private final AuthService auth;
    private final AuthRestrictionListener restrictions;
    private final MessageCatalog messages;

    /** Where each pending player should be put once they authenticate. */
    private final Map<UUID, Location> returnTo = new ConcurrentHashMap<>();

    public AuthPlacementListener(
            Plugin plugin,
            AuthService auth,
            AuthRestrictionListener restrictions,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.auth = auth;
        this.restrictions = restrictions;
        this.messages = messages;
    }

    /**
     * Starts the authentication flow.
     *
     * MONITOR and last: every other join handler has already run, so the location captured here is
     * the one the player would actually have had, spawn plugins and all.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();

        if (!auth.settings().enabled()) {
            return;
        }

        Location origin = player.getLocation().clone();
        returnTo.put(player.getUniqueId(), origin);

        auth.resolve(player, origin);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();

        auth.forget(uuid);
        restrictions.forget(uuid);
        returnTo.remove(uuid);
    }

    /**
     * Sends an unlinked player to the link world.
     *
     * Called by the authentication service through the unauthenticated event rather than directly,
     * so a server with no link world configured simply does not move anybody — the restrictions
     * still apply, and the player links from wherever they are.
     */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onUnauthenticated(PlayerUnauthenticatedEvent event) {
        if (!event.isLinked()) {
            sendToLinkWorld(event.getPlayer());
        }
    }

    /** Puts a player back once they are in, and tells them so. */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onAuthenticated(PlayerAuthenticatedEvent event) {
        Player player = event.getPlayer();
        Location destination = returnTo.remove(player.getUniqueId());

        // A player resumed on a session was never moved, so there is nothing to undo and no reason
        // to yank them across the world on the tick they joined.
        if (!event.isResumed() && destination != null && inLinkWorld(player)) {
            player.teleport(spawnOutsideLinkWorld(destination));
        }

        player.sendMessage(event.isResumed()
                ? messages.prefixed("auth.resumed")
                : messages.prefixed("auth.welcome"));
    }

    private void sendToLinkWorld(Player player) {
        Location linkSpawn = auth.settings().linkWorldSpawn();

        if (linkSpawn == null) {
            if (!auth.settings().linkWorldName().isBlank()) {
                plugin.getLogger().warning("The link world \"" + auth.settings().linkWorldName()
                        + "\" is not loaded — unlinked players stay where they joined. They are still "
                        + "restricted, but they are standing in your survival spawn while they link.");
            }
            return;
        }

        if (inLinkWorld(player)) {
            return;
        }

        player.teleport(linkSpawn);
    }

    private boolean inLinkWorld(Player player) {
        return auth.settings().isLinkWorld(player.getWorld().getName());
    }

    /**
     * Where to put a player leaving the link world.
     *
     * Their captured location, unless that is itself inside the link world — which happens whenever
     * they joined there, either as a first-time player or because they quit mid-link last time.
     * Sending them back to a spot they can never authenticate their way out of would be a loop, so
     * the main world's spawn is used instead.
     */
    private Location spawnOutsideLinkWorld(Location captured) {
        if (!auth.settings().isLinkWorld(captured.getWorld().getName())) {
            return captured;
        }

        return plugin.getServer().getWorlds().stream()
                .filter(world -> !auth.settings().isLinkWorld(world.getName()))
                .findFirst()
                .map(org.bukkit.World::getSpawnLocation)
                .orElse(captured);
    }
}
