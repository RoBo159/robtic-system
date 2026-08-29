package org.robtic.minecraft.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.ServerSettings;

import java.lang.management.ManagementFactory;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Reports this server's lifecycle and telemetry.
 *
 * A clean shutdown writes OFFLINE; an unclean one simply stops heartbeating and the API promotes
 * the stale row to CRASHED — a process that has died cannot report its own death, so detection has
 * to live on the other side.
 *
 * The telemetry here is what backs the bot's `!status` command: TPS, memory, uptime and world.
 */
public final class StatusService {

    private static final long MEGABYTE = 1024 * 1024;

    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final ServerSettings server;
    private final Logger logger;

    private final long startedAtMillis = System.currentTimeMillis();

    public StatusService(ApiClient client, ApiGateway gateway, ApiSettings api, ServerSettings server, Logger logger) {
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.server = server;
        this.logger = logger;
    }

    /** Announces startup. Must run off the main thread. */
    public void reportStarted() {
        post("/api/server/start", snapshot("ONLINE"));
    }

    public void reportHeartbeat() {
        post("/api/server/heartbeat", snapshot("ONLINE"));
    }

    /**
     * Announces a clean shutdown.
     *
     * Sent synchronously and without the queue: the scheduler is already gone by this point, and
     * queueing an OFFLINE for replay would report the server as stopping long after it restarted.
     */
    public void reportStopped() {
        JsonObject body = snapshot("OFFLINE");
        body.addProperty("onlinePlayers", 0);

        try {
            client.post("/api/server/stop", body);
        } catch (ApiException error) {
            logger.log(Level.WARNING, "Could not report shutdown to the Robtic API", error);
        }
    }

    private void post(String path, JsonObject body) {
        try {
            client.post(path, body);
            gateway.markAvailable(true);
        } catch (ApiException error) {
            if (error.isRetryable()) {
                gateway.markAvailable(false);
            }
            // Heartbeats are deliberately not queued: a replayed heartbeat would assert a
            // liveness that was true minutes ago, which is exactly what crash detection must not
            // be told.
            logger.fine("Status report failed: " + error.getMessage());
        }
    }

    private JsonObject snapshot(String status) {
        Runtime runtime = Runtime.getRuntime();

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        body.addProperty("serverType", api.serverType());
        body.addProperty("pluginVersion", pluginVersion());
        body.addProperty("status", status);
        body.addProperty("onlinePlayers", Bukkit.getOnlinePlayers().size());
        body.addProperty("maxPlayers", Bukkit.getMaxPlayers());
        body.addProperty("minecraftVersion", Bukkit.getMinecraftVersion());
        body.addProperty("software", Bukkit.getName() + " " + Bukkit.getMinecraftVersion());
        body.addProperty("javaVersion", System.getProperty("java.version", "unknown"));
        body.addProperty("uptimeMs", System.currentTimeMillis() - startedAtMillis);
        body.addProperty("memoryUsedMb", (runtime.totalMemory() - runtime.freeMemory()) / MEGABYTE);
        body.addProperty("memoryMaxMb", runtime.maxMemory() / MEGABYTE);

        // Paper exposes a rolling TPS average; the first entry is the 1-minute figure, which is
        // the one worth showing because it reacts fast enough to be useful.
        double[] tps = Bukkit.getTPS();
        if (tps.length > 0) {
            body.addProperty("tps", Math.round(Math.min(20.0, tps[0]) * 100.0) / 100.0);
        }

        double load = ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage();
        if (load >= 0) {
            body.addProperty("cpuPercent", Math.min(100.0, Math.round(load * 100.0) / 100.0));
        }

        if (!Bukkit.getWorlds().isEmpty()) {
            body.addProperty("world", Bukkit.getWorlds().get(0).getName());
        }

        if (!server.publicAddress().isBlank()) {
            body.addProperty("address", server.publicAddress());
            body.addProperty("port", server.publicPort());
        }

        if (!server.supportedVersions().isEmpty()) {
            JsonArray versions = new JsonArray();
            server.supportedVersions().forEach(versions::add);
            body.add("supportedVersions", versions);
        }

        return body;
    }

    private String pluginVersion() {
        return Bukkit.getPluginManager().getPlugin("RobticMinecraft") == null
                ? "unknown"
                : Bukkit.getPluginManager().getPlugin("RobticMinecraft").getPluginMeta().getVersion();
    }
}
