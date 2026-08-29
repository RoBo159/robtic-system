package org.robtic.minecraft.staff;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.ServerSettings;
import org.robtic.minecraft.config.StaffSettings;
import org.robtic.minecraft.service.StaffLogService;
import org.robtic.minecraft.util.Durations;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Jailing: confinement to a configured location for a fixed or indefinite time.
 *
 * The sentence belongs to the network, not to this process. It is stored by the API, re-read on
 * join, and expires on the API's own sweep — so a player cannot outlast a sentence by logging off,
 * and a restart does not free anyone. The local set is the mirror the movement listener reads.
 */
public final class JailService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final StaffSettings staffSettings;
    private final MessageCatalog messages;
    private final StaffChatService staffChat;
    private final StaffLogService log;

    private final Set<UUID> jailed = ConcurrentHashMap.newKeySet();
    private final Map<UUID, String> reasons = new ConcurrentHashMap<>();

    public JailService(
            Plugin plugin,
            ApiGateway gateway,
            ApiSettings api,
            ServerSettings server,
            StaffSettings staffSettings,
            MessageCatalog messages,
            StaffChatService staffChat,
            StaffLogService log
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.staffSettings = staffSettings;
        this.messages = messages;
        this.staffChat = staffChat;
        this.log = log;
    }

    public boolean isJailed(UUID uuid) {
        return jailed.contains(uuid);
    }

    public Set<UUID> jailedPlayers() {
        return Set.copyOf(jailed);
    }

    public boolean isCommandAllowed(String commandLine) {
        return staffSettings.isJailCommandAllowed(commandLine);
    }

    public Location jailLocation() {
        return server.jailLocation();
    }

    /**
     * Jails a player.
     *
     * Refuses when no jail location has been set — teleporting someone to a null location would
     * either do nothing or drop them at world spawn, and both look like the punishment silently
     * failed.
     */
    public void jail(Player moderator, Player target, Long durationMillis, String reason) {
        Location destination = server.jailLocation();

        if (destination == null) {
            moderator.sendMessage(messages.prefixed("jail.no-location"));
            return;
        }

        UUID uuid = target.getUniqueId();

        if (!jailed.add(uuid)) {
            moderator.sendMessage(messages.prefixed("jail.already-jailed", "player", target.getName()));
            return;
        }

        reasons.put(uuid, reason);
        target.teleport(destination);

        String rendered = Durations.format(durationMillis);

        target.sendMessage(messages.prefixed("jail.target-notified", "reason", reason, "duration", rendered));
        moderator.sendMessage(messages.prefixed("jail.applied", "player", target.getName(), "duration", rendered));
        staffChat.broadcast(messages.text("jail.broadcast",
                "moderator", moderator.getName(), "player", target.getName(),
                "duration", rendered, "reason", reason));

        JsonObject body = baseBody(moderator, target);
        body.addProperty("reason", reason);
        if (durationMillis != null) {
            body.addProperty("durationMs", durationMillis);
        }

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);
        gateway.submit("/api/staff/jail", body, requestId);

        log.action("jail").actor(moderator.getUniqueId(), moderator.getName())
                .target(uuid, target.getName()).reason(reason).duration(rendered).submit();
    }

    public void release(Player moderator, Player target, String reason) {
        UUID uuid = target.getUniqueId();

        if (!jailed.remove(uuid)) {
            moderator.sendMessage(messages.prefixed("jail.not-jailed", "player", target.getName()));
            return;
        }

        reasons.remove(uuid);
        sendHome(target);

        target.sendMessage(messages.prefixed("jail.target-released"));
        moderator.sendMessage(messages.prefixed("jail.released", "player", target.getName()));
        staffChat.broadcast(messages.text("jail.release-broadcast",
                "moderator", moderator.getName(), "player", target.getName()));

        JsonObject body = baseBody(moderator, target);
        if (reason != null && !reason.isBlank()) {
            body.addProperty("reason", reason);
        }

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);
        gateway.submit("/api/staff/unjail", body, requestId);

        log.action("release").actor(moderator.getUniqueId(), moderator.getName())
                .target(uuid, target.getName()).reason(reason).submit();
    }

    /**
     * Applies a sentence the API reported. Used on join and when Discord releases someone early.
     *
     * A player who joins still serving a sentence is teleported straight back to the jail, which
     * is what makes the sentence survive a reconnect.
     */
    public void applyRemoteState(UUID uuid, boolean isJailed, String reason) {
        if (isJailed) {
            jailed.add(uuid);
            if (reason != null) {
                reasons.put(uuid, reason);
            }

            Player player = Bukkit.getPlayer(uuid);
            Location destination = server.jailLocation();
            if (player != null && destination != null) {
                player.teleport(destination);
                player.sendMessage(messages.prefixed("jail.still-serving", "reason", reason == null ? "" : reason));
            }
            return;
        }

        if (jailed.remove(uuid)) {
            reasons.remove(uuid);
            Player player = Bukkit.getPlayer(uuid);
            if (player != null) {
                sendHome(player);
                player.sendMessage(messages.prefixed("jail.target-released"));
            }
        }
    }

    /** Where a released player goes: the staff spawn when configured, otherwise world spawn. */
    private void sendHome(Player player) {
        Location release = server.location("staff.jail-release");
        if (release == null) {
            release = player.getWorld().getSpawnLocation();
        }
        player.teleport(release);
    }

    private JsonObject baseBody(Player moderator, Player target) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("targetUuid", target.getUniqueId().toString());
        body.addProperty("targetUsername", target.getName());
        body.addProperty("moderatorUuid", moderator.getUniqueId().toString());
        body.addProperty("moderatorUsername", moderator.getName());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        return body;
    }
}
