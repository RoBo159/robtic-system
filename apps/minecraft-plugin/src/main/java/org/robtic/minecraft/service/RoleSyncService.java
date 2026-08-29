package org.robtic.minecraft.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.RoleSettings;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Mirrors LuckPerms groups onto Discord roles.
 *
 * <h2>Direction</h2>
 *
 * Minecraft decides. A player's groups are read from LuckPerms on this server, this class works out
 * which Discord roles that implies from roles.yml, and the API is told the outcome — grant these,
 * revoke those. Nothing is ever read back from Discord to change a group.
 *
 * The previous arrangement ran the other way: the bot computed a group delta, queued it as a bridge
 * event, and the plugin applied it. Both sides wrote the same state, so whichever ran last won.
 *
 * <h2>Why this makes far fewer requests than what it replaced</h2>
 *
 * <ul>
 *   <li><b>Resolution is local.</b> Working out a player's rank used to require their Discord roles,
 *       which meant a profile fetch per player. Groups are in memory, so rank now costs nothing.</li>
 *   <li><b>Only changes are sent.</b> {@link #lastSynced} records what Discord was last told. A
 *       player whose groups have not moved produces no request at all, so the steady state of a
 *       full server is zero traffic rather than one call per player per pass.</li>
 *   <li><b>Changes are batched.</b> Everything that moved within one flush window goes in a single
 *       request, so a mass rank edit or a server restart is one call, not one per player.</li>
 *   <li><b>Changes are event-driven.</b> LuckPerms tells us the moment a group changes, so the
 *       periodic reconcile exists only as a safety net and almost always finds nothing to do.</li>
 * </ul>
 */
public final class RoleSyncService {

    private final Plugin plugin;
    private final Logger logger;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final RoleSettings roles;
    private final PermissionSyncService permissions;

    /** Groups as last read from LuckPerms. Read by tick-bound callers, so it must never block. */
    private final Map<UUID, List<String>> current = new ConcurrentHashMap<>();

    /** Role ids Discord was last told about, per player. The basis of "has anything changed?". */
    private final Map<UUID, Set<String>> lastSynced = new ConcurrentHashMap<>();

    /** Players whose groups moved since the last flush. */
    private final Set<UUID> dirty = ConcurrentHashMap.newKeySet();

    private final Map<UUID, String> names = new ConcurrentHashMap<>();

    public RoleSyncService(
            Plugin plugin,
            ApiGateway gateway,
            ApiSettings api,
            RoleSettings roles,
            PermissionSyncService permissions
    ) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.gateway = gateway;
        this.api = api;
        this.roles = roles;
        this.permissions = permissions;
    }

    /**
     * Subscribes to LuckPerms so any group change marks the player for the next flush.
     *
     * The handler does almost nothing on purpose — it runs on whatever thread LuckPerms recalculated
     * on, and the actual read and send happen on the flush task.
     */
    public void start() {
        permissions.onGroupsChanged(uuid -> {
            if (names.containsKey(uuid)) {
                dirty.add(uuid);
            }
        });
    }

    /**
     * The groups a player holds, for local rank resolution. Never blocks.
     *
     * Falls back to the LuckPerms in-memory view when this cache has not been populated yet, which
     * happens for the first tick or two after a join.
     */
    public List<String> groupsOf(UUID uuid) {
        List<String> cached = current.get(uuid);
        if (cached != null) {
            return cached;
        }

        return permissions.loadedGroupsOf(uuid).orElse(List.of());
    }

    /** Records a player as present and reads their groups. Off-thread: it may hit LuckPerms storage. */
    public void track(UUID uuid, String username) {
        names.put(uuid, username);
        refresh(uuid);
        dirty.add(uuid);
    }

    /**
     * Stops tracking a player.
     *
     * `lastSynced` is dropped with everything else: the next time they join, their roles are
     * reconciled from scratch, which is the correct behaviour after an absence of unknown length.
     */
    public void forget(UUID uuid) {
        names.remove(uuid);
        current.remove(uuid);
        lastSynced.remove(uuid);
        dirty.remove(uuid);
    }

    /** Re-reads one player's groups from LuckPerms. Off-thread only. */
    public void refresh(UUID uuid) {
        current.put(uuid, permissions.groupsOf(uuid));
    }

    /** Marks a player as needing a re-send, e.g. after staff mode changed their group. */
    public void markDirty(UUID uuid) {
        if (names.containsKey(uuid)) {
            dirty.add(uuid);
        }
    }

    /** Re-reads and re-sends everyone, for `/robtic refresh` and for a reconnect. */
    public void refreshAll() {
        for (UUID uuid : names.keySet()) {
            refresh(uuid);
            dirty.add(uuid);
        }
    }

    /**
     * Sends everything that changed since the last call, as one request.
     *
     * Off-thread only. A player whose resolved role set matches what Discord was last told is
     * dropped here rather than sent — which is what makes the steady state free.
     */
    public void flush() {
        if (!permissions.isEnabled() || dirty.isEmpty()) {
            return;
        }

        List<UUID> pending = List.copyOf(dirty);
        JsonArray players = new JsonArray();
        List<UUID> sent = new ArrayList<>();

        for (UUID uuid : pending) {
            String username = names.get(uuid);
            if (username == null) {
                dirty.remove(uuid);
                continue;
            }

            refresh(uuid);
            List<String> groups = current.getOrDefault(uuid, List.of());
            Set<String> wanted = new HashSet<>(roles.roleIdsFor(groups));
            Set<String> previous = lastSynced.get(uuid);

            if (previous != null && previous.equals(wanted)) {
                // Nothing moved. Clearing the flag without sending is the whole optimisation.
                dirty.remove(uuid);
                continue;
            }

            // Revoke only what this configuration manages and the player no longer qualifies for.
            // A role granted on Discord for an unrelated reason is never in this list, so it is
            // never taken away by the game server.
            List<String> revoke = roles.managedRoleIds().stream().filter(id -> !wanted.contains(id)).toList();

            JsonObject entry = new JsonObject();
            entry.addProperty("uuid", uuid.toString());
            entry.addProperty("username", username);
            entry.add("groups", toArray(groups));
            entry.add("grantRoleIds", toArray(wanted));
            entry.add("revokeRoleIds", toArray(revoke));
            players.add(entry);
            sent.add(uuid);
        }

        if (players.isEmpty()) {
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        body.add("players", players);
        body.addProperty("requestId", ApiGateway.requestIdFor("role-sync", sent.getFirst(), System.currentTimeMillis()));

        try {
            gateway.client().post("/api/discord/sync-roles", body, body.get("requestId").getAsString());

            // Recorded only after the API accepted it. A failed send leaves the flag set, so the
            // next flush retries rather than silently deciding the roles are already correct.
            for (UUID uuid : sent) {
                lastSynced.put(uuid, new HashSet<>(roles.roleIdsFor(current.getOrDefault(uuid, List.of()))));
                dirty.remove(uuid);
            }
        } catch (ApiException error) {
            logger.log(Level.FINE, "Discord role sync deferred for " + sent.size() + " player(s): " + error.code());
        }
    }

    /** The staff rank a player holds, resolved from their groups against roles.yml. */
    public Optional<org.robtic.minecraft.model.StaffRank> rankOf(UUID uuid) {
        return roles.highestFor(groupsOf(uuid));
    }

    /** Convenience for callers holding a Player. */
    public Optional<org.robtic.minecraft.model.StaffRank> rankOf(Player player) {
        return rankOf(player.getUniqueId());
    }

    private static JsonArray toArray(Iterable<String> values) {
        JsonArray array = new JsonArray();
        for (String value : values) {
            array.add(value);
        }
        return array;
    }
}
