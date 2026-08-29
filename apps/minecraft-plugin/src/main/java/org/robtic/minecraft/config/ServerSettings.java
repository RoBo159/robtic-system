package org.robtic.minecraft.config;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;

/**
 * `config.yml` — this server's identity, the fixed locations, and the feature switches.
 *
 * Locations are resolved lazily rather than at load time: a world managed by a multiverse plugin
 * may not exist yet when this plugin enables, and resolving eagerly would permanently null a
 * perfectly valid staff spawn.
 */
public final class ServerSettings {

    private final FileConfiguration config;

    private final String serverId;
    private final String serverName;
    private final String serverType;
    private final String publicAddress;
    private final int publicPort;
    private final List<String> supportedVersions;

    private final boolean staffSystemEnabled;
    private final boolean chatBridgeEnabled;
    private final boolean staffChatBridgeEnabled;
    private final boolean announceConnections;
    private final boolean permissionSyncEnabled;
    private final int freeHomeLimit;
    private final boolean notifyUnlinkedOnJoin;
    private final boolean requireLinkForEconomy;
    private final boolean joinAlertsEnabled;
    private final boolean debug;

    private final boolean npcEnabled;
    private final List<String> npcNames;

    private final String exchangeTitle;
    private final int exchangeRows;

    ServerSettings(FileConfiguration config) {
        this.config = config;

        this.serverId = config.getString("server.id", "survival").trim();
        this.serverName = config.getString("server.name", "Survival").trim();
        this.serverType = config.getString("server.type", "survival").trim();
        this.publicAddress = config.getString("server.address", "").trim();
        this.publicPort = config.getInt("server.port", 25565);
        this.supportedVersions = config.getStringList("server.supported-versions");

        this.staffSystemEnabled = config.getBoolean("staff.enabled", true);
        this.chatBridgeEnabled = config.getBoolean("bridge.chat-to-discord", true);
        this.staffChatBridgeEnabled = config.getBoolean("bridge.staff-chat-to-discord", true);
        this.announceConnections = config.getBoolean("bridge.announce-connections", true);
        this.permissionSyncEnabled = config.getBoolean("permissions.sync-enabled", true);
        this.freeHomeLimit = config.getInt("survival.free-home-limit", 2);
        this.notifyUnlinkedOnJoin = config.getBoolean("verification.notify-on-join", true);
        this.requireLinkForEconomy = config.getBoolean("verification.require-link-for-economy", false);
        this.joinAlertsEnabled = config.getBoolean("staff.join-alerts", true);
        this.debug = config.getBoolean("debug", false);

        this.npcEnabled = config.getBoolean("npc.enabled", true);
        this.npcNames = config.getStringList("npc.names");

        this.exchangeTitle = config.getString("exchange.title", "Coin Exchange");
        this.exchangeRows = Math.min(6, Math.max(1, config.getInt("exchange.rows", 4)));
    }

    public String serverId() {
        return serverId;
    }

    public String serverName() {
        return serverName;
    }

    public String serverType() {
        return serverType;
    }

    public String publicAddress() {
        return publicAddress;
    }

    public int publicPort() {
        return publicPort;
    }

    public List<String> supportedVersions() {
        return supportedVersions;
    }

    public boolean staffSystemEnabled() {
        return staffSystemEnabled;
    }

    public boolean chatBridgeEnabled() {
        return chatBridgeEnabled;
    }

    public boolean staffChatBridgeEnabled() {
        return staffChatBridgeEnabled;
    }

    public boolean announceConnections() {
        return announceConnections;
    }

    /**
     * Homes a player with no premium tier may set.
     *
     * A local fallback only: the API is what enforces the limit, and this is what the plugin shows
     * when it cannot reach the API to ask. Keep the two in step.
     */
    public int freeHomeLimit() {
        return freeHomeLimit;
    }

    public boolean permissionSyncEnabled() {
        return permissionSyncEnabled;
    }

    public boolean notifyUnlinkedOnJoin() {
        return notifyUnlinkedOnJoin;
    }

    public boolean requireLinkForEconomy() {
        return requireLinkForEconomy;
    }

    public boolean joinAlertsEnabled() {
        return joinAlertsEnabled;
    }

    public boolean debug() {
        return debug;
    }

    public boolean npcEnabled() {
        return npcEnabled;
    }

    public List<String> npcNames() {
        return npcNames;
    }

    public String exchangeTitle() {
        return exchangeTitle;
    }

    public int exchangeRows() {
        return exchangeRows;
    }

    /** Where `/admin` puts a staff member. Null when unset or the world is not loaded. */
    public Location staffSpawn() {
        return location("staff.spawn");
    }

    /** Where `/jail` puts a player. Null until an operator has run `/jail-set`. */
    public Location jailLocation() {
        return location("staff.jail");
    }

    /**
     * Reads a `{world, x, y, z, yaw, pitch}` block.
     *
     * Resolved on each call so a world loaded after this plugin enabled still works, and returns
     * null rather than throwing so a caller can fall back to a sensible default.
     */
    public Location location(String path) {
        ConfigurationSection section = config.getConfigurationSection(path);
        if (section == null) {
            return null;
        }

        String worldName = section.getString("world", "");
        if (worldName.isBlank()) {
            return null;
        }

        World world = Bukkit.getWorld(worldName);
        if (world == null) {
            return null;
        }

        return new Location(
                world,
                section.getDouble("x"),
                section.getDouble("y"),
                section.getDouble("z"),
                (float) section.getDouble("yaw"),
                (float) section.getDouble("pitch")
        );
    }

    /** The backing document, so a command that persists a location can write through to it. */
    public FileConfiguration raw() {
        return config;
    }
}
