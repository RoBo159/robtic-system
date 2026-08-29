package org.robtic.core.discord;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;

/**
 * Moves Discord IDs out of the monolith's central config into the plugin that now owns them.
 *
 * <h2>What it is reading</h2>
 *
 * RobticMinecraft 3.x kept every Discord ID in two files: a {@code discord:} block in
 * {@code config.yml} holding the guild, four channels and a {@code log-actions} routing map, and
 * {@code roles.yml} holding a Discord role ID per staff rank. Both were Core-shaped files that
 * several features reached into.
 *
 * After the split each plugin owns its own IDs, which means those values have to end up somewhere
 * else — and an operator should not have to move them by hand across ten files, reading a changelog
 * to work out which log action belongs to which plugin.
 *
 * <h2>Read-only against the old files, and it runs once</h2>
 *
 * The legacy config is never modified. Values are copied into the target plugin's own file, and a
 * marker is written so the migration does not run again — an operator who then deletes a migrated
 * channel wants it to stay deleted, not to reappear on the next restart.
 *
 * Nothing is overwritten either: a target key that already has a value is left alone and reported.
 * The only safe assumption when both files have an opinion is that the newer one was deliberate.
 */
public final class DiscordMigration {

    /** Written into a migrated file so the copy happens exactly once. */
    private static final String MARKER = "discord.migrated-from-3x";

    private final Plugin plugin;
    private final File legacyDirectory;

    private final List<String> moved = new ArrayList<>();
    private final List<String> skipped = new ArrayList<>();

    /**
     * @param legacyDirectory the monolith's data folder, normally {@code plugins/RobticMinecraft}.
     *                        Absent on a fresh install, which is the common case
     */
    public DiscordMigration(Plugin plugin, File legacyDirectory) {
        this.plugin = plugin;
        this.legacyDirectory = legacyDirectory;
    }

    /** Whether there is anything to migrate from. */
    public boolean legacyPresent() {
        return legacyDirectory != null
                && legacyDirectory.isDirectory()
                && new File(legacyDirectory, "config.yml").isFile();
    }

    /**
     * Copies the values this plugin should own into its own file.
     *
     * @param target       the plugin's own config file, created if absent
     * @param channels     legacy path in config.yml to target key under {@code discord.channels} —
     *                     {@code "discord.log-channel"} to {@code "logs"}
     * @param logActions   legacy action IDs from {@code discord.log-actions} this plugin owns
     * @return whether anything was written
     */
    public boolean migrate(File target, Map<String, String> channels, List<String> logActions) {
        if (!legacyPresent()) {
            return false;
        }

        FileConfiguration legacy = YamlConfiguration.loadConfiguration(
                new File(legacyDirectory, "config.yml"));

        FileConfiguration destination = YamlConfiguration.loadConfiguration(target);

        if (destination.getBoolean(MARKER, false)) {
            return false;
        }

        boolean wrote = false;

        for (Map.Entry<String, String> entry : channels.entrySet()) {
            String value = legacy.getString(entry.getKey(), "");

            if (value == null || value.isBlank()) {
                continue;
            }

            String path = "discord.channels." + entry.getValue();

            if (has(destination, path)) {
                skipped.add(path + " (already set)");
                continue;
            }

            destination.set(path, value.trim());
            moved.add(entry.getKey() + " → " + path);

            wrote = true;
        }

        ConfigurationSection actions = legacy.getConfigurationSection("discord.log-actions");

        if (actions != null) {
            for (String action : logActions) {
                String value = actions.getString(action, "");

                if (value == null || value.isBlank()) {
                    continue;
                }

                String path = "discord.log-actions." + action;

                if (has(destination, path)) {
                    skipped.add(path + " (already set)");
                    continue;
                }

                destination.set(path, value.trim());
                moved.add("discord.log-actions." + action + " → " + path);

                wrote = true;
            }
        }

        if (!wrote) {
            return false;
        }

        // Turned on, because an operator who had Discord configured in 3.x plainly wants it. Left
        // alone if they have already made a decision either way.
        if (!has(destination, "discord.enabled")) {
            destination.set("discord.enabled", true);
        }

        destination.set(MARKER, true);

        try {
            destination.save(target);
        } catch (IOException failure) {
            plugin.getLogger().log(Level.WARNING,
                    "Could not write migrated Discord settings to " + target.getName()
                            + ". Nothing was lost — the original config.yml is untouched — but the"
                            + " values will have to be copied by hand.", failure);

            return false;
        }

        report(target.getName());

        return true;
    }

    /**
     * Whether a key is genuinely set, as opposed to present-and-blank.
     *
     * The shipped configs contain {@code logs: ""}, so a plain {@code contains} would treat every
     * default as an existing value and migrate nothing at all.
     */
    private static boolean has(FileConfiguration config, String path) {
        String value = config.getString(path, "");

        return value != null && !value.isBlank();
    }

    private void report(String file) {
        plugin.getLogger().info("Migrated " + moved.size() + " Discord setting(s) from"
                + " RobticMinecraft into " + file + ":");

        moved.forEach(line -> plugin.getLogger().info("  " + line));

        skipped.forEach(line -> plugin.getLogger().info("  kept existing value: " + line));

        plugin.getLogger().info("  The original config.yml was not modified.");
    }

    /** A convenience for a plugin that only needs channel keys moved. */
    public static Map<String, String> channels(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();

        for (int index = 0; index + 1 < pairs.length; index += 2) {
            map.put(pairs[index], pairs[index + 1]);
        }

        return map;
    }
}
