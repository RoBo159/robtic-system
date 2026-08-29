package org.robtic.core.config;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;

/**
 * The configuration files RobticCore owns, and the settings objects built from them.
 *
 * <h2>Core owns only what is shared</h2>
 *
 * Eight files, and every one of them is read by more than one plugin or describes the ecosystem
 * rather than a feature. {@code staff.yml} is not here, because only RobticStaff reads it;
 * {@code roles.yml} is, because Core's permission sync and RobticStaff both need the rank taxonomy
 * and duplicating it would let the two disagree about who is an admin.
 *
 * That is the rule the requirement "never duplicate configuration files" turns into: a file lives
 * with its single reader, or in Core if it has several.
 *
 * <h2>Reload swaps everything at once</h2>
 *
 * Every settings object is rebuilt and assigned together, so a reload cannot leave one plugin
 * reading the new API key while another still has the old one. The objects are immutable and the
 * fields are volatile; readers hold the registry rather than the settings, which is why
 * {@link #api()} is a method and not a field anybody caches.
 */
public final class CoreConfig {

    /**
     * Every file Core owns, restored from the jar if an operator deletes one.
     *
     * The three progression-adjacent files at the end are read as raw configurations by the modules
     * that consume them rather than parsed into settings objects here — they define registries whose
     * shape belongs to those modules, and a settings class per file would only forward them.
     */
    private static final String[] FILES = {
            "config.yml",
            "api.yml",
            "messages.yml",
            "logging.yml",
            "roles.yml",
            "statistics.yml",
            "licenses.yml",
            "titles.yml",
            "notifications.yml",
    };

    private final Plugin plugin;
    private final Map<String, FileConfiguration> loaded = new LinkedHashMap<>();

    private volatile ApiSettings api;
    private volatile ServerSettings server;
    private volatile MessageCatalog messages;
    private volatile LoggingSettings logging;
    private volatile RoleSettings roles;

    public CoreConfig(Plugin plugin) {
        this.plugin = plugin;
    }

    /** Reads every file from disk and rebuilds the settings objects. Safe to call at runtime. */
    public void reload() {
        loaded.clear();

        for (String name : FILES) {
            loaded.put(name, read(name));
        }

        this.api = new ApiSettings(loaded.get("api.yml"), loaded.get("config.yml"));
        this.server = new ServerSettings(loaded.get("config.yml"));
        this.messages = new MessageCatalog(loaded.get("messages.yml"));
        this.logging = new LoggingSettings(loaded.get("logging.yml"));
        this.roles = new RoleSettings(loaded.get("roles.yml"));
    }

    /**
     * Copies the packaged default on first run, then parses whatever is on disk.
     *
     * Keys added by a plugin update are merged in from the packaged copy, so an existing install
     * picks up new settings without the operator diffing two files by hand. A file they deleted is
     * restored rather than treated as empty, which keeps a mistake from silently disabling a feature.
     */
    private FileConfiguration read(String name) {
        File file = new File(plugin.getDataFolder(), name);

        if (!file.exists()) {
            plugin.saveResource(name, false);
        }

        FileConfiguration configuration = YamlConfiguration.loadConfiguration(file);

        try (var stream = plugin.getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(YamlConfiguration.loadConfiguration(
                        new InputStreamReader(stream, StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            plugin.getLogger().log(Level.WARNING, "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    /** The raw parsed file, for a module that reads it wholesale rather than through fields. */
    public FileConfiguration raw(String name) {
        return loaded.get(name);
    }

    public ApiSettings api() {
        return api;
    }

    public ServerSettings server() {
        return server;
    }

    public MessageCatalog messages() {
        return messages;
    }

    public LoggingSettings logging() {
        return logging;
    }

    public RoleSettings roles() {
        return roles;
    }
}
