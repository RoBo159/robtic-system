package org.robtic.discord;

import com.google.gson.JsonObject;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.ServerSettings;

import java.util.UUID;

/**
 * Public chat, both directions.
 *
 * Outbound messages are submitted through the gateway, so chat sent while the API is down is
 * queued rather than dropped. Chat is one of the few things where that is arguably the wrong
 * trade — a message replayed ten minutes late reads oddly — but the queue drops entries older
 * than its age limit, so a long outage discards them rather than posting stale conversation.
 */
public final class ChatBridgeService {

    private static final int MAX_LENGTH = 256;

    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final MessageCatalog messages;

    public ChatBridgeService(ApiGateway gateway, ApiSettings api, ServerSettings server, MessageCatalog messages) {
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.messages = messages;
    }

    /** Queues one in-game line for the public Discord channel. */
    public void sendToDiscord(UUID uuid, String username, String message) {
        if (!server.chatBridgeEnabled()) {
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("channel", "public");
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("message", truncate(message));
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);
        gateway.submit("/api/discord/chat", body, requestId);
    }

    /** Shows a Discord message in game. Main thread only. */
    public void showInGame(String username, String message) {
        Component component = messages.component("chat.from-discord",
                "player", username, "message", truncate(message));
        Bukkit.getServer().sendMessage(component);
    }

    private String truncate(String value) {
        String trimmed = value.strip();
        return trimmed.length() <= MAX_LENGTH ? trimmed : trimmed.substring(0, MAX_LENGTH);
    }
}
