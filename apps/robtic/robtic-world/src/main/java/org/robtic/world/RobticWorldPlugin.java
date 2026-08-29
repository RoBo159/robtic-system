package org.robtic.world;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.logging.Level;

/**
 * RobticWorld: everything that exists because a structure was generated.
 *
 * <h2>What this plugin owns</h2>
 *
 * The building marker system, the structure registry, scanning, validation, region generation and
 * structure persistence. A builder designs a structure, drops markers in it, and saves it with
 * BetterStructures; this plugin notices the result, reads the markers, checks them and announces
 * what it found through {@link org.robtic.world.events.StructureScannedEvent}.
 *
 * <h2>What it does not own, and never will</h2>
 *
 * What a structure <em>is</em>. A workspace, a dungeon, a guild hall — those are decisions belonging
 * to whoever listens for that event. This plugin does not contain the word "profession" anywhere,
 * and the split is what makes that true rather than aspirational: RobticJobs depends on RobticWorld,
 * so the reverse dependency cannot compile.
 *
 * <h2>BetterStructures is optional</h2>
 *
 * Without it nothing generates, so nothing is discovered — but a builder can still place markers and
 * run {@code /structure marker validate} in a build world, which is most of what this plugin is for
 * during design. One warning at startup, and everything else works.
 */
public final class RobticWorldPlugin extends RobticPlugin {

    /** The one file this plugin owns. */
    private static final String CONFIG = "markers.yml";

    private StructureMarkerSystem markers;

    private volatile FileConfiguration config;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.optional("BetterStructures",
                        "structures will not generate, though markers can still be placed and"
                                + " validated by hand"));
    }

    @Override
    protected void start() {
        reloadConfigFile();

        markers = new StructureMarkerSystem(this, () -> config, this::reloadConfigFile);
        markers.enable();

        startDiscord();
    }

    /** Never null: resolves to a do-nothing integration when Discord is off or absent. */
    private org.robtic.core.discord.DiscordIntegration discord;

    /**
     * This plugin's optional Discord integration.
     *
     * Off by default. Structure discovery works identically without RobticDiscord — this only
     * mirrors what was found, and a validation failure is already reported to the console where a
     * builder will actually see it.
     */
    private void startDiscord() {
        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        config.getConfigurationSection("discord"), CONFIG, getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        org.robtic.core.service.RobticServices.register(this,
                org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "world";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return routes();
                    }
                });
    }

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> routes() {
        var section = config.getConfigurationSection("discord.log-actions");

        if (section == null) {
            return java.util.Map.of();
        }

        java.util.Map<String, String> routes = new java.util.LinkedHashMap<>();

        for (String action : section.getKeys(false)) {
            String channel = section.getString(action, "");

            if (channel != null && !channel.isBlank()) {
                routes.put(action, channel.trim());
            }
        }

        return routes;
    }

    @Override
    protected void stop() {
        if (markers != null) {
            markers.disable();
        }
    }

    /**
     * Reads {@code markers.yml}, restoring it if it has been deleted and merging in keys added by a
     * plugin update.
     *
     * The merge matters more than it looks: without it, an existing install picks up none of the
     * settings a new version adds, and the operator has to diff two files by hand to find out what
     * they are missing. With it, a new marker type or a new scan setting arrives with a sensible
     * default already in place.
     */
    private void reloadConfigFile() {
        File file = new File(getDataFolder(), CONFIG);

        if (!file.exists()) {
            saveResource(CONFIG, false);
        }

        FileConfiguration loaded = YamlConfiguration.loadConfiguration(file);

        try (var stream = getResource(CONFIG)) {
            if (stream != null) {
                loaded.setDefaults(YamlConfiguration.loadConfiguration(
                        new InputStreamReader(stream, StandardCharsets.UTF_8)));
                loaded.options().copyDefaults(true);
            }
        } catch (Exception error) {
            getLogger().log(Level.WARNING, "Could not merge defaults for " + CONFIG, error);
        }

        this.config = loaded;
    }

    /** The marker system, for a module registering marker types of its own. */
    public StructureMarkerSystem markers() {
        return markers;
    }
}
