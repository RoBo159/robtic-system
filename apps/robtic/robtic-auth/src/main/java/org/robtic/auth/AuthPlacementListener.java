package org.robtic.auth;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;

import java.util.Optional;
import java.util.UUID;

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
 * <h2>Everyone waits in the link world, not only the unlinked</h2>
 *
 * This used to move a player only when they had no Discord link at all. Somebody who was linked and
 * merely had to type a password stayed wherever they joined — standing in the survival world, visible
 * to everyone, for as long as the login took. The restrictions made that harmless but not sensible,
 * and it meant the login experience differed depending on a distinction the player has no reason to
 * care about.
 *
 * Now any player who reaches the world without a valid session is put in the link world and brought
 * back when they authenticate. See {@code auth.link-world-holds} for the old behaviour.
 *
 * Note that most Java players never see this at all: {@link AuthConfigurationListener} takes the
 * password before the world is entered, so a player with a session or a password simply joins. This
 * path is for Bedrock players, first-time linkers, and servers with {@code pre-join-login} off.
 *
 * <h2>The return location outlives the session</h2>
 *
 * Captured before anything moves them, for the same reason {@code AfkSnapshot} does it: the server
 * saves a player wherever they happen to be at logout, so a player moved to the link world would
 * otherwise be saved there permanently.
 *
 * An in-memory capture is not enough, though, and the case that breaks it is the common one — a
 * player is moved to the link world, does not log in, and closes the game. Their real position is
 * then nowhere. So it goes through {@link AuthReturnStore}, which writes it to disk before the
 * teleport that makes it necessary.
 */
public final class AuthPlacementListener implements Listener {

    private final Plugin plugin;
    private final AuthService auth;
    private final AuthRestrictionListener restrictions;
    private final AuthReturnStore returns;
    private final MessageCatalog messages;

    public AuthPlacementListener(
            Plugin plugin,
            AuthService auth,
            AuthRestrictionListener restrictions,
            AuthReturnStore returns,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.auth = auth;
        this.restrictions = restrictions;
        this.returns = returns;
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

        // Refused when the player loaded inside the link world, which is what happens on the second
        // join of somebody who quit mid-login. Storing it would overwrite the real position they are
        // still owed from last time — see AuthReturnStore#remember.
        returns.remember(player.getUniqueId(), origin, inLinkWorld(player));

        auth.resolve(player, origin);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();

        auth.forget(uuid);
        restrictions.forget(uuid);

        // The return store is deliberately not cleared. A player who disconnects before logging in
        // is exactly who it is for; it is cleared when they are actually put back.
    }

    /**
     * Sends an unauthenticated player to the link world.
     *
     * Called by the authentication service through the unauthenticated event rather than directly,
     * so a server with no link world configured simply does not move anybody — the restrictions
     * still apply, and the player authenticates from wherever they are.
     */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onUnauthenticated(PlayerUnauthenticatedEvent event) {
        if (!event.isLinked() || auth.settings().holdEveryoneInLinkWorld()) {
            sendToLinkWorld(event.getPlayer());
        }
    }

    /** Puts a player back once they are in, and tells them so. */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onAuthenticated(PlayerAuthenticatedEvent event) {
        Player player = event.getPlayer();

        // Only somebody actually standing in the link world is moved. A player resumed on a session
        // was never taken there, and yanking them across the world on the tick they joined would be
        // a teleport they did not earn.
        if (inLinkWorld(player)) {
            player.teleport(destinationFor(player));
        }

        // Cleared whichever branch ran. Keeping it would mean the next login teleported them to a
        // location they have since left.
        returns.forget(player.getUniqueId());

        player.sendMessage(event.isResumed()
                ? messages.prefixed("auth.resumed")
                : messages.prefixed("auth.welcome"));
    }

    private void sendToLinkWorld(Player player) {
        Location linkSpawn = auth.settings().linkWorldSpawn();

        if (linkSpawn == null) {
            if (!auth.settings().linkWorldName().isBlank()) {
                plugin.getLogger().warning("The link world \"" + auth.settings().linkWorldName()
                        + "\" is not loaded — unauthenticated players stay where they joined. They are"
                        + " still restricted, but they are standing in your survival spawn while they"
                        + " authenticate.");
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
     * The location recorded before they were moved, which survives a disconnect. Falling back to a
     * world spawn only when there is genuinely nothing recorded — a first-time player, or somebody
     * whose stored world has since been removed from the server.
     */
    private Location destinationFor(Player player) {
        Optional<Location> remembered = returns.recall(player.getUniqueId());

        if (remembered.isPresent()
                && !auth.settings().isLinkWorld(remembered.get().getWorld().getName())) {
            return remembered.get();
        }

        return firstWorldOutsideLinkWorld().orElse(player.getLocation());
    }

    /**
     * The spawn of the first world that is not the link world.
     *
     * The destination for a player with no recorded position. Returning them to the link world spawn
     * instead would be a loop: they authenticate, arrive where they started, and are still in the
     * world they were meant to be leaving.
     */
    private Optional<Location> firstWorldOutsideLinkWorld() {
        return plugin.getServer().getWorlds().stream()
                .filter(world -> !auth.settings().isLinkWorld(world.getName()))
                .findFirst()
                .map(org.bukkit.World::getSpawnLocation);
    }
}
