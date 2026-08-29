package org.robtic.core.listener;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.event.PlayerJoinStateEvent;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.RoleSyncService;

import java.util.UUID;
import java.util.logging.Level;

/**
 * Tells the API a player arrived or left, and publishes what it says back.
 *
 * <h2>Why this is one listener in Core and not five in five plugins</h2>
 *
 * {@code /api/server/playerJoin} returns one document that five different subsystems need: freeze
 * and jail state for RobticStaff, the unread count for RobticMail, AFK totals for RobticEssentials,
 * and warning counts for the welcome message.
 *
 * A join listener in each plugin would be the obvious translation of the monolith and would send
 * five identical requests on every join, on the path a player is waiting on. Instead the request is
 * made once here and the answer is published as {@link PlayerJoinStateEvent}; each plugin reads the
 * fields it cares about and ignores the rest.
 *
 * <h2>What stays here</h2>
 *
 * Only what is genuinely Core's: the two API calls, role-sync tracking, and invalidating the cached
 * profile on quit. Everything with a feature attached to it — vanish, staff mode, freeze, mail, AFK —
 * is handled by the plugin that owns it, in its own listener, where its ordering is its own business.
 */
public final class PlayerConnectionListener implements Listener {

    private final Plugin plugin;
    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final PlayerDataService players;
    private final RoleSyncService roleSync;

    public PlayerConnectionListener(
            Plugin plugin,
            ApiClient client,
            ApiGateway gateway,
            ApiSettings api,
            PlayerDataService players,
            RoleSyncService roleSync
    ) {
        this.plugin = plugin;
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.players = players;
        this.roleSync = roleSync;
    }

    /**
     * Announces the join and publishes the reply.
     *
     * At {@link EventPriority#MONITOR} so every plugin that wanted to act on the join itself has
     * already done so — this only reports it.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();

        UUID uuid = player.getUniqueId();
        String username = player.getName();

        // Reads this player's LuckPerms groups and marks them for the next role-sync flush. Off the
        // main thread because LuckPerms may have to load the user from its own storage.
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin,
                () -> roleSync.track(uuid, username));

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            JsonObject state = requestJoinState(uuid, username);

            // Back on the tick before publishing, so no listener has to remember to hop — see
            // PlayerJoinStateEvent. Skipped entirely if they left during the request.
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                if (plugin.getServer().getPlayer(uuid) == null) {
                    return;
                }

                plugin.getServer().getPluginManager().callEvent(
                        new PlayerJoinStateEvent(uuid, username, state));
            });
        });
    }

    /**
     * @return the API's answer, or an empty document after a failure — never null, so every listener
     *         reads an outage as "no state" rather than having to handle a second absent case
     */
    private JsonObject requestJoinState(UUID uuid, String username) {
        try {
            JsonObject body = new JsonObject();

            body.addProperty("guildId", api.guildId());
            body.addProperty("uuid", uuid.toString());
            body.addProperty("username", username);
            body.addProperty("serverId", api.serverId());
            body.addProperty("serverName", api.serverName());
            body.addProperty("requestId",
                    ApiGateway.requestIdFor("join", uuid, System.currentTimeMillis()));

            JsonObject state = client.post("/api/server/playerJoin", body);

            gateway.markAvailable(true);

            return state;
        } catch (ApiException error) {
            if (error.isRetryable()) {
                gateway.markAvailable(false);
            }

            // FINE, not WARNING. An unreachable API on join is already reported by the gateway, and
            // repeating it per player would fill the console during an outage with lines that all
            // say the same thing.
            plugin.getLogger().log(Level.FINE,
                    "Could not resolve join state for " + username, error);

            return new JsonObject();
        }
    }

    /**
     * Announces the departure.
     *
     * Queued through the gateway rather than posted directly: a player leaving during an outage must
     * still be recorded as having left, and the queue replays it when the API returns.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();

        UUID uuid = player.getUniqueId();
        String username = player.getName();

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            JsonObject body = new JsonObject();

            body.addProperty("guildId", api.guildId());
            body.addProperty("uuid", uuid.toString());
            body.addProperty("username", username);
            body.addProperty("serverId", api.serverId());
            body.addProperty("serverName", api.serverName());

            String requestId = ApiGateway.requestIdFor("leave", uuid, System.currentTimeMillis());
            body.addProperty("requestId", requestId);

            gateway.deliver("/api/server/playerLeave", body, requestId);

            players.invalidate(uuid);
        });
    }
}
