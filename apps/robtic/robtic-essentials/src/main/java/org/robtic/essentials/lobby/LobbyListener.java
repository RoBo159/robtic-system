package org.robtic.essentials.lobby;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.core.util.ItemSerialization;

import java.util.logging.Level;

/**
 * Detects entering and leaving the lobby, and captures the survival inventory on the way out.
 *
 * <h2>Three events, one decision</h2>
 *
 * Join, world change and respawn can each land a player in the lobby, and each has to produce the
 * same outcome. They all funnel into {@link #evaluate}, which compares the world against the
 * configured lobby and calls the manager — so there is one definition of "entered the lobby"
 * rather than three that drift apart.
 *
 * <h2>Why the inventory is captured here</h2>
 *
 * The lobby previews the survival inventory, but by the time a player is standing in the lobby
 * Multiverse-Inventories has already swapped it away. The last moment it is both current and in
 * memory is the world-change event *out of* a survival world, which is where this captures it.
 *
 * The capture is read-only in every sense: it is never restored, never written back to a world, and
 * read only by the preview menu. Restoring inventories remains Multiverse-Inventories' job.
 */
public final class LobbyListener implements Listener {

    private final Plugin plugin;
    private final LobbyConfiguration config;
    private final LobbyManager lobby;
    private final SurvivalCacheService cache;
    private final LobbyNotifications notifications;
    private final PlayerVisibilityService visibility;

    public LobbyListener(
            Plugin plugin,
            LobbyConfiguration config,
            LobbyManager lobby,
            SurvivalCacheService cache,
            LobbyNotifications notifications,
            PlayerVisibilityService visibility
    ) {
        this.plugin = plugin;
        this.config = config;
        this.lobby = lobby;
        this.cache = cache;
        this.notifications = notifications;
        this.visibility = visibility;
    }

    /**
     * MONITOR, and one tick late.
     *
     * Multiverse-Inventories applies the world's inventory during the join and world-change events;
     * giving the lobby items in the same tick would have them wiped by whichever plugin ran last.
     * Deferring by a tick makes the ordering explicit rather than dependent on listener priority
     * across two plugins.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> evaluate(player, null), 1L);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onChangedWorld(PlayerChangedWorldEvent event) {
        Player player = event.getPlayer();
        String from = event.getFrom().getName();

        // Captured before the deferred evaluate, using the inventory as it is right now — which is
        // still the survival one for the first moments after the change.
        if (!config.isLobby(from)) {
            captureSurvivalInventory(player, from);
        }

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> evaluate(player, from), 1L);
    }

    /**
     * Respawning into the lobby re-applies the state.
     *
     * A death clears the inventory and resets game mode, so the lobby items have to be given again
     * — without this a player who died would arrive with an empty hotbar.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onRespawn(PlayerRespawnEvent event) {
        Player player = event.getPlayer();
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> evaluate(player, null), 1L);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        lobby.forget(event.getPlayer().getUniqueId());
        notifications.forget(event.getPlayer().getUniqueId());
    }

    /**
     * Flushes queued notifications once every menu is closed.
     *
     * Scheduled rather than immediate: Bukkit still reports the inventory as open while this event
     * is being handled, so an immediate flush would queue straight back into itself.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onMenuClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player player) || !notifications.hasQueued(player)) {
            return;
        }

        notifications.flushLater(player);
    }

    /** The single definition of "is this player in the lobby, and did that just change?". */
    private void evaluate(Player player, String from) {
        if (!player.isOnline()) {
            return;
        }

        boolean nowInLobby = config.isLobby(player.getWorld().getName());

        if (nowInLobby) {
            lobby.enter(player);
            return;
        }

        // Only meaningful when they were in the lobby a moment ago; leave() is a no-op otherwise.
        lobby.leave(player);

        // Their own view is restored by leave(); everyone else's has to be recomputed because a
        // player who left the lobby should reappear for the people still in it.
        visibility.applyToAll();
    }

    /**
     * Stores a read-only copy of the survival inventory for the lobby preview.
     *
     * Serialised on the main thread — reading an inventory off it is not safe — and uploaded on a
     * worker. A failure is logged and dropped: the preview showing an older capture is a cosmetic
     * problem, and nothing else depends on this.
     */
    private void captureSurvivalInventory(Player player, String world) {
        ItemStack[] contents = player.getInventory().getStorageContents();
        ItemStack[] armor = player.getInventory().getArmorContents();
        ItemStack[] offhand = { player.getInventory().getItemInOffHand() };

        String encodedContents = ItemSerialization.encode(contents);
        String encodedArmor = ItemSerialization.encode(armor);
        String encodedOffhand = ItemSerialization.encode(offhand);

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                cache.captureInventory(player.getUniqueId(), world, encodedContents, encodedArmor, encodedOffhand);
            } catch (RuntimeException error) {
                plugin.getLogger().log(Level.FINE,
                        "Could not capture the survival inventory for " + player.getName(), error);
            }
        });
    }
}
