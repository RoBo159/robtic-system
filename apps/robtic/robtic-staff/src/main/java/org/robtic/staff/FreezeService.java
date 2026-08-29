package org.robtic.staff;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.staff.config.StaffSettings;
import org.robtic.staff.service.StaffLogService;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Freezing: the player stops moving and stops doing anything except talking.
 *
 * The authoritative record lives on the API, so a frozen player who logs out is still frozen when
 * they come back — reconnecting is the obvious escape route and closing it is the whole point.
 * The set held here is the in-memory mirror the movement listener consults on every tick, because
 * an HTTP call per movement event is obviously not viable.
 */
public final class FreezeService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final StaffSettings staffSettings;
    private final MessageCatalog messages;
    private final StaffChatService staffChat;
    private final StaffLogService log;

    /** Locally frozen players, mirrored from the API and consulted on the hot path. */
    private final Set<UUID> frozen = ConcurrentHashMap.newKeySet();
    private final Map<UUID, String> reasons = new ConcurrentHashMap<>();

    private int actionBarTask = -1;

    public FreezeService(
            Plugin plugin,
            ApiGateway gateway,
            ApiSettings api,
            StaffSettings staffSettings,
            MessageCatalog messages,
            StaffChatService staffChat,
            StaffLogService log
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.staffSettings = staffSettings;
        this.messages = messages;
        this.staffChat = staffChat;
        this.log = log;
    }

    public boolean isFrozen(UUID uuid) {
        return frozen.contains(uuid);
    }

    public Set<UUID> frozenPlayers() {
        return Set.copyOf(frozen);
    }

    public boolean isCommandAllowed(String commandLine) {
        return staffSettings.isFreezeCommandAllowed(commandLine);
    }

    /**
     * Freezes a player.
     *
     * Applied locally first so the freeze takes effect on the same tick the moderator clicked,
     * then recorded remotely. Doing it the other way round would leave a window in which a
     * suspected cheater is still free to act while an HTTP round trip completes.
     */
    public void freeze(Player moderator, Player target, String reason) {
        UUID uuid = target.getUniqueId();

        if (!frozen.add(uuid)) {
            moderator.sendMessage(messages.prefixed("freeze.already-frozen", "player", target.getName()));
            return;
        }

        reasons.put(uuid, reason == null ? "" : reason);

        target.sendMessage(messages.prefixed("freeze.target-notified", "reason", safeReason(reason)));
        target.showTitle(net.kyori.adventure.title.Title.title(
                messages.component("freeze.title"),
                messages.component("freeze.subtitle", "reason", safeReason(reason))
        ));

        moderator.sendMessage(messages.prefixed("freeze.applied", "player", target.getName()));
        staffChat.broadcast(messages.text("freeze.broadcast",
                "moderator", moderator.getName(), "player", target.getName(), "reason", safeReason(reason)));

        publish("/api/staff/freeze", moderator, target, reason);
        log.action("freeze").actor(moderator.getUniqueId(), moderator.getName())
                .target(uuid, target.getName()).reason(reason).submit();
    }

    public void unfreeze(Player moderator, Player target) {
        UUID uuid = target.getUniqueId();

        if (!frozen.remove(uuid)) {
            moderator.sendMessage(messages.prefixed("freeze.not-frozen", "player", target.getName()));
            return;
        }

        reasons.remove(uuid);

        target.sendMessage(messages.prefixed("freeze.target-released"));
        moderator.sendMessage(messages.prefixed("freeze.released", "player", target.getName()));
        staffChat.broadcast(messages.text("freeze.release-broadcast",
                "moderator", moderator.getName(), "player", target.getName()));

        publish("/api/staff/unfreeze", moderator, target, null);
        log.action("unfreeze").actor(moderator.getUniqueId(), moderator.getName())
                .target(uuid, target.getName()).submit();
    }

    /** Applies a freeze state the API reported, e.g. on join or from a Discord-side release. */
    public void applyRemoteState(UUID uuid, boolean isFrozen, String reason) {
        if (isFrozen) {
            frozen.add(uuid);
            reasons.put(uuid, reason == null ? "" : reason);
        } else {
            frozen.remove(uuid);
            reasons.remove(uuid);
        }
    }

    /** Tells staff that a frozen player disconnected, which is usually a deliberate escape. */
    public void handleDisconnect(Player player) {
        if (!frozen.contains(player.getUniqueId())) {
            return;
        }

        staffChat.broadcast(messages.text("freeze.disconnected", "player", player.getName()));
        log.action("freeze").target(player.getUniqueId(), player.getName())
                .reason("Disconnected while frozen").submit();
    }

    /**
     * Starts the reminder ticker.
     *
     * The action bar is re-sent on an interval rather than once, because Minecraft fades it after
     * a few seconds and a frozen player who sees nothing assumes the server has hung.
     */
    public void startActionBarTask() {
        actionBarTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (frozen.isEmpty()) {
                return;
            }

            for (UUID uuid : frozen) {
                Player player = Bukkit.getPlayer(uuid);
                if (player != null && player.isOnline()) {
                    player.sendActionBar(messages.component("freeze.actionbar",
                            "reason", safeReason(reasons.get(uuid))));
                }
            }
        }, staffSettings.freezeActionBarIntervalTicks(), staffSettings.freezeActionBarIntervalTicks()).getTaskId();
    }

    public void stop() {
        if (actionBarTask != -1) {
            Bukkit.getScheduler().cancelTask(actionBarTask);
            actionBarTask = -1;
        }
    }

    private void publish(String path, Player moderator, Player target, String reason) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("targetUuid", target.getUniqueId().toString());
        body.addProperty("targetUsername", target.getName());
        body.addProperty("moderatorUuid", moderator.getUniqueId().toString());
        body.addProperty("moderatorUsername", moderator.getName());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        if (reason != null && !reason.isBlank()) {
            body.addProperty("reason", reason);
        }

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);
        gateway.submit(path, body, requestId);
    }

    private String safeReason(String reason) {
        return reason == null || reason.isBlank() ? messages.text("freeze.no-reason") : reason;
    }
}
