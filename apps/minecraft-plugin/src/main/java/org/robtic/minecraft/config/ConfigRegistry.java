package org.robtic.minecraft.config;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;

/**
 * Loads and re-loads the plugin's configuration files.
 *
 * The configuration is split across eight files rather than one because they have different
 * audiences: an operator edits `messages.yml` constantly and `api.yml` once. Each file is parsed
 * into an immutable settings object, and a reload swaps every object at once — so a half-applied
 * reload cannot leave the plugin reading a mix of old and new values.
 */
public final class ConfigRegistry {

    /** Every file the plugin owns. Each is copied from the jar on first start if absent. */
    private static final String[] FILES = {
            "config.yml",
            "api.yml",
            "messages.yml",
            "items.yml",
            "roles.yml",
            "lobbies.yml",
            "logging.yml",
            "staff.yml",
            "prices.yml",
            "afk.yml",
            "premium.yml",
            "lobby.yml",
            "auth.yml",
            // Core infrastructure, read as a raw configuration by the statistics module. Listed
            // before the progression files because progression depends on statistics and not the
            // other way round — the order here has no runtime meaning, but a reader tracing the
            // dependency should not have to look for it.
            "statistics.yml",
            "licenses.yml",
            // The building marker system. Core infrastructure like statistics: progression consumes
            // the structures it discovers, but nothing in this file depends on progression having
            // loaded, and a future dungeon or guild module will read the same registry.
            "markers.yml",
            // Progression. Read as raw configurations by the progression module rather than parsed
            // into settings objects here: they define registries whose shape belongs to that module,
            // and a settings class per file would only forward them.
            "titles.yml",
            "jobs.yml",
            "npc.yml",
            "workspace.yml",
    };

    private final Plugin plugin;
    private final Map<String, FileConfiguration> loaded = new LinkedHashMap<>();

    private volatile ApiSettings api;
    private volatile ServerSettings server;
    private volatile StaffSettings staff;
    private volatile MessageCatalog messages;
    private volatile ItemCatalog items;
    private volatile RoleSettings roles;
    private volatile LobbySettings lobbies;
    private volatile LoggingSettings logging;
    private volatile PremiumSettings premium;
    private volatile org.robtic.minecraft.lobby.LobbyConfiguration lobby;

    public ConfigRegistry(Plugin plugin) {
        this.plugin = plugin;
    }

    /** The raw parsed file, for a caller that pushes it verbatim rather than reading fields. */
    public org.bukkit.configuration.file.FileConfiguration raw(String name) {
        return loaded.get(name);
    }

    /** Reads every file from disk and rebuilds the settings objects. Safe to call at runtime. */
    public void reload() {
        loaded.clear();

        for (String name : FILES) {
            loaded.put(name, read(name));
        }

        this.api = new ApiSettings(loaded.get("api.yml"), loaded.get("config.yml"));
        this.server = new ServerSettings(loaded.get("config.yml"));
        this.staff = new StaffSettings(loaded.get("staff.yml"));
        this.messages = new MessageCatalog(loaded.get("messages.yml"));
        this.items = new ItemCatalog(loaded.get("items.yml"), plugin.getLogger());
        this.roles = new RoleSettings(loaded.get("roles.yml"));
        this.lobbies = new LobbySettings(loaded.get("lobbies.yml"));
        this.logging = new LoggingSettings(loaded.get("logging.yml"));
        this.premium = new PremiumSettings(loaded.get("premium.yml"));
        this.lobby = org.robtic.minecraft.lobby.LobbyConfiguration.parse(loaded.get("lobby.yml"), plugin.getLogger());
    }

    /**
     * Copies the packaged default on first run, then parses whatever is on disk.
     *
     * A file the operator has deleted is restored rather than treated as empty, which keeps a
     * mistake from silently disabling a whole feature.
     */
    private FileConfiguration read(String name) {
        File file = new File(plugin.getDataFolder(), name);

        if (!file.exists()) {
            plugin.saveResource(name, false);
        }

        YamlConfiguration configuration = YamlConfiguration.loadConfiguration(file);

        // Keys added by a plugin update are merged in from the packaged copy, so an existing
        // install picks up new settings without the operator having to diff two files by hand.
        try (var stream = plugin.getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(
                        YamlConfiguration.loadConfiguration(new java.io.InputStreamReader(stream, java.nio.charset.StandardCharsets.UTF_8))
                );
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            plugin.getLogger().log(Level.WARNING, "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    public ApiSettings api() {
        return api;
    }

    public ServerSettings server() {
        return server;
    }

    public StaffSettings staff() {
        return staff;
    }

    public MessageCatalog messages() {
        return messages;
    }

    public ItemCatalog items() {
        return items;
    }

    public RoleSettings roles() {
        return roles;
    }

    public LobbySettings lobbies() {
        return lobbies;
    }

    public LoggingSettings logging() {
        return logging;
    }

    public PremiumSettings premium() {
        return premium;
    }

    public org.robtic.minecraft.lobby.LobbyConfiguration lobby() {
        return lobby;
    }
}
