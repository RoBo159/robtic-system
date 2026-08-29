package org.robtic.minecraft.staff;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitScheduler;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.RoleSettings;
import org.robtic.minecraft.config.ServerSettings;
import org.robtic.minecraft.model.PlayerSnapshot;
import org.robtic.minecraft.model.StaffRank;
import org.robtic.minecraft.service.PermissionSyncService;
import org.robtic.minecraft.service.StaffLogService;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Staff mode: the session, the inventory swap, and the rank change.
 *
 * <h2>Why the ordering is what it is</h2>
 *
 * Enabling runs: capture on the main thread → <b>store remotely and wait</b> → only then clear and
 * equip. The snapshot is durable before anything is destroyed, so every later failure — a crash, a
 * kill -9, a plugin reload — still has something to restore from.
 *
 * Disabling runs: fetch the snapshot → restore on the main thread → <b>only then</b> tell the API
 * to delete it. A restore that fails halfway leaves the backup in place and the next join picks it
 * up. The cost of that ordering is a rare double-restore; the cost of the opposite ordering is a
 * permanently lost inventory, which is not a trade worth making.
 */
public final class StaffModeService {

    private final Plugin plugin;
    private final BukkitScheduler scheduler;
    private final Logger logger;

    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final RoleSettings roles;
    private final MessageCatalog messages;

    private final PermissionSyncService permissions;
    private final StaffToolService tools;
    private final StaffChatService staffChat;
    private final StaffLogService log;

    /** Who is currently in staff mode on this server, and at what rank. */
    private final Map<UUID, StaffRank> active = new ConcurrentHashMap<>();
    /** When each session opened, for %robtic_staff_session%. Local, so the placeholder never blocks. */
    private final Map<UUID, Long> sessionStartedAt = new ConcurrentHashMap<>();
    /** Guards against a second /admin arriving while the first is still awaiting the API. */
    private final Set<UUID> transitioning = ConcurrentHashMap.newKeySet();

    public StaffModeService(
            Plugin plugin,
            ApiClient client,
            ApiGateway gateway,
            ApiSettings api,
            ServerSettings server,
            RoleSettings roles,
            MessageCatalog messages,
            PermissionSyncService permissions,
            StaffToolService tools,
            StaffChatService staffChat,
            StaffLogService log
    ) {
        this.plugin = plugin;
        this.scheduler = plugin.getServer().getScheduler();
        this.logger = plugin.getLogger();
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.roles = roles;
        this.messages = messages;
        this.permissions = permissions;
        this.tools = tools;
        this.staffChat = staffChat;
        this.log = log;
    }

    public boolean isInStaffMode(UUID uuid) {
        return active.containsKey(uuid);
    }

    public Optional<StaffRank> rankOf(UUID uuid) {
        return Optional.ofNullable(active.get(uuid));
    }

    /** When this player entered staff mode, or empty when they are not in it. */
    public Optional<Long> sessionStartedAt(UUID uuid) {
        return Optional.ofNullable(sessionStartedAt.get(uuid));
    }

    public Set<UUID> activeStaff() {
        return Set.copyOf(active.keySet());
    }

    /** Toggles a player in or out of staff mode. Main thread entry point for `/admin`. */
    public void toggle(Player player) {
        if (isInStaffMode(player.getUniqueId())) {
            disable(player, "command");
        } else {
            enable(player);
        }
    }

    /**
     * Enters staff mode.
     *
     * Eligibility is a LuckPerms group, not a Bukkit permission and not a Discord role: the player
     * must hold a group that `roles.yml` maps to a rank. That is resolved here, on this server,
     * with no request — and a Discord account is not required for any of it.
     */
    public void enable(Player player) {
        UUID uuid = player.getUniqueId();

        if (!server.staffSystemEnabled()) {
            player.sendMessage(messages.prefixed("staff.system-disabled"));
            return;
        }

        if (!transitioning.add(uuid)) {
            return;
        }

        String username = player.getName();
        PlayerSnapshot snapshot = PlayerSnapshot.capture(player);

        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                // Deliberately no link check.
                //
                // Staff is a LuckPerms group now, which says nothing about whether the player owns
                // a Discord account. Refusing here would mean somebody could hold the rank, have
                // the server enforce it, and still be unable to open /admin — taking /hide, /a and
                // every other staff command down with it, since they all gate on staff mode.
                //
                // Resolved from the player's LuckPerms groups against roles.yml — entirely on this
                // server, with no request. LuckPerms is the authority on who is staff, so holding
                // the group IS holding the rank; the matching Discord role is a mirror of that
                // decision rather than an input to it.
                Optional<StaffRank> localRank = roles.highestFor(permissions.groupsOf(uuid));
                if (localRank.isEmpty()) {
                    finish(uuid, () -> player.sendMessage(messages.prefixed("staff.no-permission")));
                    return;
                }

                JsonObject body = new JsonObject();
                body.addProperty("guildId", api.guildId());
                body.addProperty("uuid", uuid.toString());
                body.addProperty("username", username);
                body.addProperty("serverId", api.serverId());
                body.addProperty("serverName", api.serverName());
                body.addProperty("requestId", ApiGateway.requestIdFor("staff-on", uuid, System.currentTimeMillis()));
                body.add("snapshot", snapshot.toJson());

                // The claim the API records. Sent as the whole rank rather than just the role id so
                // the session, the audit entry and the LuckPerms group all describe the same thing
                // this server's roles.yml describes, without the API needing a copy of it.
                StaffRank claimed = localRank.get();
                JsonObject claim = new JsonObject();
                // Only when there is one: a rank need not mirror onto Discord, and sending a blank
                // string fails the API's snowflake validation outright.
                if (!claimed.discordRoleId().isBlank()) {
                    claim.addProperty("roleId", claimed.discordRoleId());
                }
                claim.addProperty("name", claimed.displayName());
                claim.addProperty("group", claimed.group());
                claim.addProperty("priority", claimed.priority());
                body.add("rank", claim);

                // Awaited deliberately: nothing may be cleared until this has returned.
                JsonObject session = client.post("/api/staff/enable", body);
                gateway.markAvailable(true);

                StaffRank rank = localRank.get();
                String rankGroup = session.has("rankGroup") ? session.get("rankGroup").getAsString() : rank.group();

                finish(uuid, () -> applyStaffState(player, rank, rankGroup));
            } catch (ApiException error) {
                if (error.isRetryable()) {
                    gateway.markAvailable(false);
                }
                // No local fallback on purpose. Entering staff mode without a durable backup is
                // exactly the situation that loses an inventory, so it is refused instead.
                finish(uuid, () -> player.sendMessage(messages.prefixed("staff.api-unavailable")));
                logger.log(Level.WARNING, "Could not open a staff session for " + username, error);
            }
        });
    }

    /** Applies the in-game half of entering staff mode. Main thread only. */
    private void applyStaffState(Player player, StaffRank rank, String rankGroup) {
        if (!player.isOnline()) {
            return;
        }

        UUID uuid = player.getUniqueId();
        active.put(uuid, rank);
        sessionStartedAt.put(uuid, System.currentTimeMillis());

        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.getInventory().setItemInOffHand(null);
        player.setLevel(0);
        player.setExp(0f);

        Location spawn = server.staffSpawn();
        if (spawn != null) {
            player.teleport(spawn);
        }

        tools.give(player);
        staffChat.setEnabled(uuid, true);

        // Deliberately does NOT touch LuckPerms.
        //
        // The rank group is the player's identity now — it is what makes them staff and what
        // /admin resolves their rank from. Swapping it away on exit (which is what this used to do)
        // would mean a staff member outside staff mode holds only the base group, resolves to no
        // rank, and can never get back in.
        //
        // It also keeps the Discord mirror still: groups no longer change on every /admin toggle,
        // so no role churn is generated by entering and leaving staff mode.
        player.sendMessage(messages.prefixed("staff.enabled", "rank", rank.displayName()));

        log.action("staff_enabled").actor(uuid, player.getName()).reason("Rank: " + rank.displayName()).submit();
        staffChat.broadcast(messages.text("staff.chat-enabled-broadcast", "player", player.getName(), "rank", rank.displayName()));
    }

    /**
     * Leaves staff mode and restores everything.
     *
     * @param reason why the session ended — `command`, `disconnect`, `shutdown` or `recovery`.
     *               A disconnect and a shutdown both restore synchronously, because the player
     *               object is about to stop existing.
     */
    public void disable(Player player, String reason) {
        UUID uuid = player.getUniqueId();

        if (!active.containsKey(uuid) && !"recovery".equals(reason)) {
            return;
        }

        boolean synchronous = "disconnect".equals(reason) || "shutdown".equals(reason);

        if (synchronous) {
            disableSynchronously(player, reason);
            return;
        }

        if (!transitioning.add(uuid)) {
            return;
        }

        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                JsonObject response = requestDisable(uuid, reason);
                finish(uuid, () -> completeRestore(player, response, reason));
            } catch (ApiException error) {
                gateway.markAvailable(!error.isRetryable());
                finish(uuid, () -> player.sendMessage(messages.prefixed("staff.restore-failed")));
                logger.log(Level.WARNING, "Could not close the staff session for " + player.getName(), error);
            }
        });
    }

    /**
     * The disconnect and shutdown path.
     *
     * Runs on the calling thread because there is no later tick: the quit event is the last moment
     * the player object is usable. A blocking HTTP call in an event handler is normally
     * unacceptable, and it is accepted here only because the alternative is losing the restore.
     */
    private void disableSynchronously(Player player, String reason) {
        UUID uuid = player.getUniqueId();
        active.remove(uuid);
        sessionStartedAt.remove(uuid);
        staffChat.setEnabled(uuid, false);

        try {
            JsonObject response = requestDisable(uuid, reason);
            completeRestore(player, response, reason);
        } catch (ApiException error) {
            // The backup is still on the server, so the next join restores it. Nothing is lost —
            // it is simply restored later than it would have been.
            logger.warning("Deferred the staff-mode restore for " + player.getName()
                    + " to their next join: " + error.getMessage());
        }
    }

    private JsonObject requestDisable(UUID uuid, String reason) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        body.addProperty("reason", reason);
        body.addProperty("requestId", ApiGateway.requestIdFor("staff-off", uuid, System.currentTimeMillis()));

        return client.post("/api/staff/disable", body);
    }

    /**
     * Restores the player, then confirms the restore so the API can drop the backup.
     *
     * The confirmation is fire-and-forget and ordered last on purpose: if it never arrives, the
     * backup survives and the next join restores again. A duplicate restore is recoverable, a
     * missing one is not.
     */
    private void completeRestore(Player player, JsonObject response, String reason) {
        UUID uuid = player.getUniqueId();
        active.remove(uuid);
        sessionStartedAt.remove(uuid);
        staffChat.setEnabled(uuid, false);
        tools.remove(player);

        if (!response.has("snapshot") || response.get("snapshot").isJsonNull()) {
            return;
        }

        PlayerSnapshot snapshot = PlayerSnapshot.fromJson(response.getAsJsonObject("snapshot"));
        snapshot.restore(player);

        // No group change on the way out either — see the note in applyStaffState. Leaving staff
        // mode ends a session; it does not demote anybody.
        confirmRestore(uuid);

        if (player.isOnline()) {
            player.sendMessage(messages.prefixed("staff.disabled"));
            player.sendMessage(messages.prefixed("staff.inventory-restored"));
        }

        log.action("staff_disabled").actor(uuid, player.getName()).reason("Ended: " + reason).submit();
    }

    private void confirmRestore(UUID uuid) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        body.addProperty("reason", "recovery");
        body.addProperty("confirmed", true);
        body.addProperty("requestId", ApiGateway.requestIdFor("staff-confirm", uuid, System.currentTimeMillis()));

        gateway.submit("/api/staff/confirm-restore", body);
    }

    /**
     * Crash recovery, run on join.
     *
     * A backup with no live session means a previous run of this server died before it could
     * restore. Nobody else will ever do it, so this is the last line of the guarantee.
     */
    public void recoverIfPending(Player player) {
        UUID uuid = player.getUniqueId();

        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                JsonObject response = client.get("/api/staff/backup", Map.of(
                        "guildId", api.guildId(),
                        "uuid", uuid.toString(),
                        "serverId", api.serverId()
                ));

                if (!response.has("exists") || !response.get("exists").getAsBoolean()) {
                    return;
                }

                scheduler.runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    logger.info("Restoring an unfinished staff session for " + player.getName() + " after an unclean shutdown.");
                    disable(player, "recovery");
                });
            } catch (ApiException error) {
                logger.fine("Could not check for a pending staff backup: " + error.getMessage());
            }
        });
    }

    /** Ends every open session, for a clean plugin shutdown. */
    public void restoreAll(String reason) {
        for (UUID uuid : Set.copyOf(active.keySet())) {
            Player player = plugin.getServer().getPlayer(uuid);
            if (player != null) {
                disableSynchronously(player, reason);
            }
        }
    }

    /** Clears the in-flight guard and runs the follow-up on the main thread. */
    private void finish(UUID uuid, Runnable action) {
        scheduler.runTask(plugin, () -> {
            transitioning.remove(uuid);
            action.run();
        });
    }
}
