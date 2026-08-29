package org.robtic.staff;

import com.google.gson.JsonObject;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.ServerSettings;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;

/**
 * The staff-only channel, in game and bridged to Discord.
 *
 * Membership is exactly "in staff mode": a player outside it can neither send nor receive, which
 * is what the requirement asks for and is enforced on both paths rather than only on send.
 *
 * Loop prevention is structural. A message arriving from Discord is shown in game and never
 * re-published, and the bot already drops anything posted by a bot or webhook — so a relayed
 * message cannot round-trip back to where it came from.
 */
public final class StaffChatService {

    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final MessageCatalog messages;

    /** Who currently has the channel open. Kept separate from staff mode so it can be toggled. */
    private final Set<UUID> listening = ConcurrentHashMap.newKeySet();

    /** Supplies staff-mode membership without this class depending on the whole mode service. */
    private Predicate<UUID> staffModeCheck = uuid -> false;

    public StaffChatService(ApiGateway gateway, ApiSettings api, ServerSettings server, MessageCatalog messages) {
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.messages = messages;
    }

    /** Wired after construction, because the mode service needs this one to exist first. */
    public void bindStaffModeCheck(Predicate<UUID> check) {
        this.staffModeCheck = check;
    }

    public void setEnabled(UUID uuid, boolean enabled) {
        if (enabled) {
            listening.add(uuid);
        } else {
            listening.remove(uuid);
        }
    }

    public boolean isEnabled(UUID uuid) {
        return listening.contains(uuid);
    }

    /** Only a player in staff mode may see the channel, regardless of any permission node. */
    public boolean canUse(Player player) {
        return staffModeCheck.test(player.getUniqueId());
    }

    /**
     * Sends a line from a staff member.
     *
     * Shown locally first and published second, so the sender sees their own message immediately
     * even when the API is slow — and the publish is queued rather than dropped if it is down.
     */
    public void send(Player sender, String rankName, String message) {
        String rendered = messages.text(
                "staff-chat.format",
                "rank", rankName,
                "player", sender.getName(),
                "message", message,
                "server", server.serverName()
        );

        broadcast(rendered);

        if (!server.staffChatBridgeEnabled()) {
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("channel", "staff");
        body.addProperty("uuid", sender.getUniqueId().toString());
        body.addProperty("username", sender.getName());
        body.addProperty("message", message);
        body.addProperty("rankName", rankName);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);
        gateway.submit("/api/discord/chat", body, requestId);
    }

    /** Shows a message to everyone currently in staff mode. Main thread only. */
    public void broadcast(String legacy) {
        Component component = MessageCatalog.render(legacy);

        for (Player online : Bukkit.getOnlinePlayers()) {
            if (staffModeCheck.test(online.getUniqueId())) {
                online.sendMessage(component);
            }
        }

        Bukkit.getConsoleSender().sendMessage(component);
    }

    /** Renders a message that arrived from the Discord staff channel. */
    public void showFromDiscord(String username, String message) {
        broadcast(messages.text("staff-chat.from-discord", "player", username, "message", message));
    }
}
