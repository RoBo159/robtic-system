package org.robtic.staff.service;

import com.google.gson.JsonObject;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.LoggingSettings;

import java.util.UUID;
import java.util.logging.Logger;

/**
 * The single entry point for auditing a staff action.
 *
 * Every freeze, jail, teleport, inspection and mode change goes through one call here, which is
 * what makes "was this logged?" answerable without auditing each feature separately. The plugin
 * names the *action*; the API resolves which Discord channel or webhook it belongs in, so no
 * Discord identifier ever appears in a plugin config file.
 *
 * Writes are submitted through the gateway, so an action taken while the API is down is queued and
 * replayed rather than lost — an audit trail with holes in it is not an audit trail.
 */
public final class StaffLogService {

    private final ApiGateway gateway;
    private final ApiSettings settings;
    private final LoggingSettings logging;
    private final Logger logger;

    public StaffLogService(ApiGateway gateway, ApiSettings settings, LoggingSettings logging, Logger logger) {
        this.gateway = gateway;
        this.settings = settings;
        this.logging = logging;
        this.logger = logger;
    }

    /** A builder, because the fields an action carries vary and most of them are optional. */
    public final class Entry {

        private final JsonObject body = new JsonObject();

        private Entry(String action) {
            body.addProperty("guildId", settings.guildId());
            body.addProperty("action", action);
            body.addProperty("serverId", settings.serverId());
            body.addProperty("serverName", settings.serverName());
        }

        public Entry actor(UUID uuid, String username) {
            body.addProperty("actorUuid", uuid.toString());
            body.addProperty("actorUsername", username);
            return this;
        }

        public Entry target(UUID uuid, String username) {
            body.addProperty("targetUuid", uuid.toString());
            body.addProperty("targetUsername", username);
            return this;
        }

        public Entry reason(String reason) {
            if (reason != null && !reason.isBlank()) {
                body.addProperty("reason", reason);
            }
            return this;
        }

        public Entry duration(String duration) {
            if (duration != null && !duration.isBlank()) {
                body.addProperty("duration", duration);
            }
            return this;
        }

        /** Queues the entry. Never throws: a failed log must not abort the action it describes. */
        public void submit() {
            String action = body.get("action").getAsString();

            if (!logging.isEnabled(action)) {
                return;
            }

            if (logging.logToConsole()) {
                logger.info("[staff] " + action
                        + (body.has("actorUsername") ? " by " + body.get("actorUsername").getAsString() : "")
                        + (body.has("targetUsername") ? " on " + body.get("targetUsername").getAsString() : ""));
            }

            if (!logging.logToDiscord()) {
                return;
            }

            String requestId = ApiGateway.newRequestId();
            body.addProperty("requestId", requestId);
            gateway.submit("/api/staff/log", body, requestId);
        }
    }

    public Entry action(String action) {
        return new Entry(action);
    }
}
