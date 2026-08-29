package org.robtic.minecraft.lobby;

import org.bukkit.GameMode;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.model.survival.SurvivalModels.PlayerSettings;
import org.robtic.minecraft.survival.SurvivalCacheService;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Owns what it means to be in the lobby: entering it, leaving it, and the state applied in between.
 *
 * <h2>The lifecycle, in one place</h2>
 *
 * <pre>
 *   enter → load settings → clear + give items → apply lobby state
 *                        → apply visibility → flush queued notifications
 *   leave → remove lobby items → restore normal state → nothing else
 * </pre>
 *
 * The listener decides *when* these run; this decides *what* they do. Keeping the two apart is what
 * lets join, world change and respawn share one implementation instead of three that drift.
 *
 * <h2>Inventories are not this module's business</h2>
 *
 * Multiverse-Inventories swaps the survival inventory in and out. Leaving the lobby therefore
 * removes only the tagged lobby items and does nothing else — clearing or restoring anything here
 * would race the plugin that owns it, and is the one thing the specification is explicit about.
 */
public final class LobbyManager {

    private final Plugin plugin;
    private final LobbyConfiguration config;
    private final LobbyItems items;
    private final SurvivalCacheService cache;
    private final PlayerVisibilityService visibility;
    private final LobbyNotifications notifications;

    /** Who the plugin currently considers to be in the lobby, so leaving is detectable. */
    private final Set<UUID> inLobby = ConcurrentHashMap.newKeySet();

    public LobbyManager(
            Plugin plugin,
            LobbyConfiguration config,
            LobbyItems items,
            SurvivalCacheService cache,
            PlayerVisibilityService visibility,
            LobbyNotifications notifications
    ) {
        this.plugin = plugin;
        this.config = config;
        this.items = items;
        this.cache = cache;
        this.visibility = visibility;
        this.notifications = notifications;
    }

    public boolean isLobbyWorld(String worldName) {
        return config.isLobby(worldName);
    }

    /** Whether this player is currently being treated as a lobby occupant. */
    public boolean isInLobby(Player player) {
        return inLobby.contains(player.getUniqueId());
    }

    /**
     * Brings a player into the lobby.
     *
     * Settings are loaded off-thread first because everything after them depends on the result —
     * visibility, particles and the join message all read the same document. Once it is cached the
     * rest is applied on the tick, where it has to be.
     */
    public void enter(Player player) {
        if (!config.enabled()) {
            return;
        }

        UUID uuid = player.getUniqueId();
        inLobby.add(uuid);

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            PlayerSettings settings = cache.loadSettings(uuid);

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                // Re-checked: the player may have left the lobby, or the server, during the load.
                if (!player.isOnline() || !config.isLobby(player.getWorld().getName())) {
                    return;
                }

                items.give(player);
                applyState(player);

                visibility.apply(player);
                // Everybody else's view has to change too, so a hidden player stays hidden for
                // those who asked not to see anyone.
                visibility.applyToAll();

                notifications.flush(player);

                plugin.getLogger().fine("Applied lobby state to " + player.getName()
                        + " (visible=" + settings.playersVisible() + ")");
            });
        });
    }

    /**
     * Takes a player out of the lobby.
     *
     * Deliberately minimal — see the class note. Removing the lobby items is the only inventory
     * operation, and the lobby-specific state is undone so it cannot leak into survival.
     */
    public void leave(Player player) {
        if (!inLobby.remove(player.getUniqueId())) {
            return;
        }

        items.remove(player);
        clearState(player);
        visibility.showAll(player);
    }

    /** Drops a disconnecting player. Their state goes with the session. */
    public void forget(UUID uuid) {
        inLobby.remove(uuid);
    }

    /**
     * The lobby's player state: fed, unhurt, not accumulating anything.
     *
     * Set rather than continuously enforced — the restriction listener cancels the *events* that
     * would change these, so they only need establishing once on entry. Adventure mode is what
     * stops block interaction at the engine level, before any listener runs.
     */
    private void applyState(Player player) {
        if (player.getGameMode() != GameMode.CREATIVE && player.getGameMode() != GameMode.SPECTATOR) {
            player.setGameMode(GameMode.ADVENTURE);
        }

        player.setFoodLevel(20);
        player.setSaturation(20f);
        player.setFireTicks(0);
        player.setExp(0f);
        player.setLevel(0);
        player.setRemainingAir(player.getMaximumAir());

        var health = player.getAttribute(Attribute.MAX_HEALTH);
        if (health != null) {
            player.setHealth(health.getValue());
        }
    }

    /**
     * Undoes only what {@link #applyState} imposed.
     *
     * Game mode is returned to survival; health, hunger and experience are left exactly as they are,
     * because those belong to the world being entered and Multiverse-Inventories restores them.
     */
    private void clearState(Player player) {
        if (player.getGameMode() == GameMode.ADVENTURE) {
            player.setGameMode(GameMode.SURVIVAL);
        }
    }
}
