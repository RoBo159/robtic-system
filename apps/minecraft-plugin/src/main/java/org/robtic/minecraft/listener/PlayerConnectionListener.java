package org.robtic.minecraft.listener;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitScheduler;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.ServerSettings;
import org.robtic.minecraft.afk.AfkRewardService;
import org.robtic.minecraft.afk.AfkStatistics;
import org.robtic.minecraft.mail.MailService;
import org.robtic.minecraft.service.PlayerDataService;
import org.robtic.minecraft.service.RoleSyncService;
import org.robtic.minecraft.staff.FreezeService;
import org.robtic.minecraft.staff.JailService;
import org.robtic.minecraft.staff.LastSeenLocations;
import org.robtic.minecraft.staff.StaffChatService;
import org.robtic.minecraft.staff.StaffModeService;
import org.robtic.minecraft.staff.StaffToolService;
import org.robtic.minecraft.staff.VanishService;

import java.util.UUID;
import java.util.logging.Level;

/**
 * Join and quit handling: punishment state, staff alerts, and the staff-mode safety net.
 *
 * The join calls `POST /api/server/playerJoin`, which returns link, groups, freeze, jail, history
 * and any unrestored staff backup in **one** response. A join is time-critical — the player is
 * already in the world — and five sequential requests would leave windows in which the plugin has
 * a partial picture and lets someone act.
 */
public final class PlayerConnectionListener implements Listener {

    private final Plugin plugin;
    private final BukkitScheduler scheduler;
    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final MessageCatalog messages;

    private final PlayerDataService players;
    private final StaffModeService staffMode;
    private final StaffChatService staffChat;
    private final StaffToolService tools;
    private final FreezeService freeze;
    private final JailService jail;
    private final VanishService vanish;
    private final RoleSyncService roleSync;
    private final MailService mail;
    private final AfkRewardService afkRewards;
    private final LastSeenLocations lastSeen;

    public PlayerConnectionListener(
            Plugin plugin,
            ApiClient client,
            ApiGateway gateway,
            ApiSettings api,
            ServerSettings server,
            MessageCatalog messages,
            PlayerDataService players,
            StaffModeService staffMode,
            StaffChatService staffChat,
            StaffToolService tools,
            FreezeService freeze,
            JailService jail,
            VanishService vanish,
            RoleSyncService roleSync,
            MailService mail,
            AfkRewardService afkRewards,
            LastSeenLocations lastSeen
    ) {
        this.plugin = plugin;
        this.scheduler = plugin.getServer().getScheduler();
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.messages = messages;
        this.players = players;
        this.staffMode = staffMode;
        this.staffChat = staffChat;
        this.tools = tools;
        this.freeze = freeze;
        this.jail = jail;
        this.vanish = vanish;
        this.roleSync = roleSync;
        this.mail = mail;
        this.afkRewards = afkRewards;
        this.lastSeen = lastSeen;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        String username = player.getName();

        // Their live position supersedes whatever this server remembered from their last exit.
        lastSeen.forget(uuid);

        vanish.applyVisibility();

        // Reads this player's LuckPerms groups and marks them for the next role-sync flush. Off the
        // main thread because LuckPerms may have to load the user from its own storage.
        scheduler.runTaskAsynchronously(plugin, () -> roleSync.track(uuid, username));

        scheduler.runTaskAsynchronously(plugin, () -> {
            JsonObject state;

            try {
                JsonObject body = new JsonObject();
                body.addProperty("guildId", api.guildId());
                body.addProperty("uuid", uuid.toString());
                body.addProperty("username", username);
                body.addProperty("serverId", api.serverId());
                body.addProperty("serverName", api.serverName());
                body.addProperty("requestId", ApiGateway.requestIdFor("join", uuid, System.currentTimeMillis()));

                state = client.post("/api/server/playerJoin", body);
                gateway.markAvailable(true);
            } catch (ApiException error) {
                if (error.isRetryable()) {
                    gateway.markAvailable(false);
                }
                plugin.getLogger().log(Level.FINE, "Could not resolve join state for " + username, error);
                return;
            }

            scheduler.runTask(plugin, () -> applyJoinState(player, state));
        });
    }

    /** Applies what the API reported. Main thread only. */
    private void applyJoinState(Player player, JsonObject state) {
        if (!player.isOnline()) {
            return;
        }

        UUID uuid = player.getUniqueId();

        if (bool(state, "frozen")) {
            freeze.applyRemoteState(uuid, true, null);
        }

        if (bool(state, "jailed")) {
            // The reason travels on the join response, so a player who was jailed while offline —
            // which is what accepting a report against them does — is told why on the same tick they
            // are teleported back into the jail, rather than arriving there with no explanation.
            jail.applyRemoteState(uuid, true, text(state, "jailReason"));
        }

        // Requested before anything else this handler sends. A jail notice or the outcome of a
        // report the player filed is what they most need to read, and it must not be pushed up the
        // chat window by a link reminder or a rank sync line. The count is seeded from the join
        // response, which already carries it, so the mailbox item is correct immediately even if
        // the fetch below is slow.
        mail.setUnread(uuid, number(state, "unreadMail"));

        // Seeded from the same response, for the same reason: the AFK placeholders may not make a
        // request, so their answer has to already be in memory before a tab list asks for it.
        if (state.has("afk") && state.get("afk").isJsonObject()) {
            JsonObject afk = state.getAsJsonObject("afk");
            afkRewards.seed(uuid, AfkStatistics.of(
                    longValue(afk, "totalMs"),
                    longValue(afk, "todayMs"),
                    text(afk, "todayDate"),
                    longValue(afk, "robs")));
        }

        mail.pending(player, waiting -> {
            if (!player.isOnline()) {
                return;
            }

            mail.announce(player, waiting);
            mail.acknowledge(player, waiting);
        });

        if (!bool(state, "linked") && server.notifyUnlinkedOnJoin()) {
            player.sendMessage(messages.prefixed("link.not-linked"));
        }

        // The last line of the no-item-loss guarantee: a backup with no live session means a
        // previous run of this server died before it could restore, and nothing else will.
        if (bool(state, "pendingStaffRestore")) {
            staffMode.recoverIfPending(player);
        }

        if (server.joinAlertsEnabled() && bool(state, "hasHistory")) {
            staffChat.broadcast(messages.text("staff.join-alert",
                    "player", player.getName(),
                    "warnings", String.valueOf(number(state, "warningCount")),
                    "jails", String.valueOf(number(state, "jailCount")),
                    "reports", String.valueOf(number(state, "reportCount"))));
        }
    }

    /**
     * Quit handling.
     *
     * Staff mode is torn down **first** and synchronously. The player object is about to stop
     * existing, so this is the last moment their inventory can be restored — everything else here
     * can afford to be asynchronous, and this cannot.
     */
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        if (staffMode.isInStaffMode(uuid)) {
            staffMode.disable(player, "disconnect");
        }

        freeze.handleDisconnect(player);

        if (vanish.shouldSuppressConnectionMessage(uuid)) {
            event.quitMessage(null);
        }

        // Recorded before anything else releases the player object: this is where they were, and it
        // is the only chance to take it. A report filed against them a minute from now shows it.
        lastSeen.record(player);

        vanish.forget(uuid);
        tools.forget(uuid);
        mail.forget(uuid);
        // The AFK cache is deliberately absent here. It is dropped by AfkService#forget instead,
        // which has to settle the session first — and this handler runs before that one, so
        // clearing it here would throw away the rounding residue the settlement is about to use.
        //
        // The overlay's own entry is dropped by its next pass, which notices the player is gone.
        staffChat.setEnabled(uuid, false);
        roleSync.forget(uuid);

        scheduler.runTaskAsynchronously(plugin, () -> {
            JsonObject body = new JsonObject();
            body.addProperty("guildId", api.guildId());
            body.addProperty("uuid", uuid.toString());
            body.addProperty("username", player.getName());
            body.addProperty("serverId", api.serverId());
            body.addProperty("serverName", api.serverName());

            String requestId = ApiGateway.requestIdFor("leave", uuid, System.currentTimeMillis());
            body.addProperty("requestId", requestId);

            gateway.deliver("/api/server/playerLeave", body, requestId);
            players.invalidate(uuid);
        });
    }

    private static boolean bool(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() && json.get(key).getAsBoolean();
    }

    private static int number(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsInt() : 0;
    }

    private static String text(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : null;
    }

    /** Milliseconds, which do not fit in the int {@link #number} returns. */
    private static long longValue(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsLong() : 0L;
    }
}
