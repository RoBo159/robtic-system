package org.robtic.discord;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.PriceService;
import org.robtic.core.staff.ModerationBridge;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Drains the events Discord queued for this server.
 *
 * Previously this polled MongoDB directly; it now polls `GET /api/discord/pending`, which claims
 * the same rows on the plugin's behalf. The claiming semantics are unchanged — a broadcast reaches
 * every server in the guild exactly once — but the plugin no longer needs database credentials to
 * participate.
 *
 * The poll runs on a worker; anything touching the world or chat is handed back to the main thread.
 */
public final class BridgeConsumerService {

    private final Plugin plugin;
    private final Logger logger;
    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;

    /**
     * How a Discord-side moderation decision reaches this server.
     *
     * A supplier rather than the bridge itself, and that is load-order rather than style. RobticStaff
     * and RobticAuth register their bridges when <em>they</em> enable, which may be after this plugin
     * has. Capturing the value here meant whichever of them started second was never seen again, and
     * a resolution that runs per event simply cannot have that problem. Never yields null.
     */
    private final Supplier<ModerationBridge> moderation;

    /**
     * The auth bridge, or null when RobticAuth is not installed.
     *
     * Resolved per event for the same reason, and the handlers are registered unconditionally. They
     * used to be registered only when the bridge already existed, which made the whole authentication
     * half of the Discord link depend on RobticAuth having enabled first — see the class note.
     */
    private final Supplier<org.robtic.core.auth.AuthBridge> auth;

    /** Event type → handler. A registry, so an unknown type is ignored rather than mishandled. */
    private final Map<String, Consumer<JsonObject>> handlers = new HashMap<>();

    public BridgeConsumerService(
            Plugin plugin,
            ApiClient client,
            ApiGateway gateway,
            ApiSettings api,
            ChatBridgeService chat,
            PriceService prices,
            PlayerDataService players,
            // Resolved per event, not captured. Must never yield null: it stands in for RobticStaff,
            // which may not be installed, and ModerationBridge.NONE drops instructions rather than
            // throwing inside the poll loop.
            Supplier<ModerationBridge> moderation,
            // May yield null, when RobticAuth is not installed. Its events are then ignored.
            Supplier<org.robtic.core.auth.AuthBridge> auth
    ) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.moderation = moderation;
        this.auth = auth;

        handlers.put("chat", payload -> onMain(() ->
                chat.showInGame(string(payload, "username"), string(payload, "message"))));

        handlers.put("staff_chat", payload -> onMain(() ->
                moderation.get().showStaffChatFromDiscord(string(payload, "username"), string(payload, "message"))));

        handlers.put("price_invalidate", payload -> prices.invalidate());

        handlers.put("config_invalidate", payload -> {
            prices.invalidate();
            players.invalidateAll();
        });

        // No "role_sync" handler, deliberately.
        //
        // Groups used to arrive from Discord as a grant/revoke delta and be applied here. That made
        // Discord a writer of LuckPerms state while the game server was also writing it, and the
        // last write won regardless of which was right. LuckPerms is now the sole authority and the
        // roles flow the other way — see RoleSyncService. An event of this type from an older bot
        // falls through to the "unknown type" path below and is ignored, which is the correct
        // outcome: it is an instruction we no longer accept.

        handlers.put("jail_release", payload -> {
            UUID uuid = uuid(payload, "minecraftUuid");
            if (uuid != null) {
                onMain(() -> moderation.get().applyJailState(uuid, false, null));
            }
        });

        handlers.put("freeze_release", payload -> {
            UUID uuid = uuid(payload, "minecraftUuid");
            if (uuid != null) {
                onMain(() -> moderation.get().applyFreezeState(uuid, false, null));
            }
        });

        // RobticAuth. Registered unconditionally and resolved per event: RobticAuth may not have
        // enabled yet when this runs, and a handler that was never registered because of load order
        // would ignore every link and password event for the rest of the server's life.
        handlers.put("account_linked", payload -> {
            UUID uuid = uuid(payload, "minecraftUuid");
            if (uuid != null) {
                withAuth(bridge -> bridge.onLinked(
                        uuid,
                        string(payload, "discordId"),
                        payload.has("hasPassword") && payload.get("hasPassword").getAsBoolean()));
            }
        });

        handlers.put("password_changed", payload -> {
            UUID uuid = uuid(payload, "minecraftUuid");
            if (uuid != null) {
                withAuth(bridge -> bridge.onPasswordChanged(
                        uuid,
                        payload.has("authenticate") && payload.get("authenticate").getAsBoolean()));
            }
        });

        handlers.put("account_unlinked", payload -> {
            UUID uuid = uuid(payload, "minecraftUuid");
            if (uuid != null) {
                withAuth(bridge -> bridge.onUnlinked(uuid));
            }
        });
    }

    /**
     * Runs something against the auth bridge on the main thread, if there is one.
     *
     * Resolved at dispatch rather than at registration, so RobticAuth enabling after this plugin is
     * invisible to everything above. Absent simply means the event is dropped, which is what a
     * server with no authentication plugin should do with an authentication event.
     */
    private void withAuth(Consumer<org.robtic.core.auth.AuthBridge> action) {
        org.robtic.core.auth.AuthBridge bridge = auth.get();

        if (bridge != null) {
            onMain(() -> action.accept(bridge));
        }
    }

    /** One drain pass. Must run off the main thread. */
    public void poll() {
        JsonObject response;

        try {
            response = client.get("/api/discord/pending", Map.of(
                    "guildId", api.guildId(),
                    "serverId", api.serverId()
            ));
            gateway.markAvailable(true);
        } catch (ApiException error) {
            if (error.isRetryable()) {
                gateway.markAvailable(false);
            }
            logger.fine("Bridge poll failed: " + error.getMessage());
            return;
        }

        JsonElement events = response.get("events");
        if (events == null || !events.isJsonArray()) {
            return;
        }

        for (JsonElement element : events.getAsJsonArray()) {
            if (!element.isJsonObject()) {
                continue;
            }

            JsonObject event = element.getAsJsonObject();
            String type = string(event, "type");

            try {
                Consumer<JsonObject> handler = handlers.get(type);
                if (handler == null) {
                    logger.fine("Ignoring bridge event of type " + type);
                    continue;
                }

                JsonElement payload = event.get("payload");
                handler.accept(payload != null && payload.isJsonObject() ? payload.getAsJsonObject() : new JsonObject());
            } catch (RuntimeException error) {
                logger.log(Level.WARNING, "Failed to handle bridge event \"" + type + "\"", error);
            }
        }
    }

    private void onMain(Runnable action) {
        Bukkit.getScheduler().runTask(plugin, action);
    }

    private static String string(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? "" : element.getAsString();
    }

    private static UUID uuid(JsonObject json, String key) {
        String raw = string(json, key);
        try {
            return raw.isBlank() ? null : UUID.fromString(raw);
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

}
