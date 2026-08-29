package org.robtic.dragonbattle.storage;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.ArenaSettings;
import org.robtic.dragonbattle.model.Perch;
import org.robtic.dragonbattle.model.Region;
import org.robtic.dragonbattle.model.StoredLocation;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;

/**
 * Reads and writes `arenas.yml`.
 *
 * <h2>Whole-file writes, on every change</h2>
 *
 * An arena is edited by an operator running a command, which is a rare event, and the file holds at
 * most a handful of arenas. Writing all of it each time costs nothing measurable and removes the
 * class of bug where a partial write leaves the file describing an arena that never existed.
 *
 * <h2>A malformed arena is skipped, not fatal</h2>
 *
 * One arena with a bad region should not stop the other three loading, and certainly should not stop
 * the plugin enabling. Anything unreadable is logged with its name and left out, so an operator is
 * told exactly which one to look at.
 */
public final class ArenaStorage {

    private final Plugin plugin;
    private final File file;

    public ArenaStorage(Plugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "arenas.yml");
    }

    public Map<String, Arena> load(ArenaSettings defaults) {
        Map<String, Arena> arenas = new LinkedHashMap<>();

        if (!file.exists()) {
            return arenas;
        }

        YamlConfiguration document = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection root = document.getConfigurationSection("arenas");

        if (root == null) {
            return arenas;
        }

        for (String name : root.getKeys(false)) {
            ConfigurationSection section = root.getConfigurationSection(name);
            if (section == null) {
                continue;
            }

            try {
                arenas.put(name, readArena(name, section, defaults));
            } catch (RuntimeException malformed) {
                plugin.getLogger().log(Level.WARNING,
                        "Skipping arena \"" + name + "\" — it could not be read. Every other arena "
                                + "still loaded.", malformed);
            }
        }

        return arenas;
    }

    private Arena readArena(String name, ConfigurationSection section, ArenaSettings defaults) {
        ArenaSettings settings = ArenaSettings.read(section.getConfigurationSection("settings"), defaults);
        Arena arena = new Arena(name, settings);

        arena.enabled(section.getBoolean("enabled", false));

        arena.dragonSpawn(StoredLocation.read(section.getConfigurationSection("dragon-spawn")));
        arena.playerSpawn(StoredLocation.read(section.getConfigurationSection("player-spawn")));
        arena.portalCentre(StoredLocation.read(section.getConfigurationSection("portal")));
        arena.beacon(StoredLocation.read(section.getConfigurationSection("beacon")));

        for (StoredLocation crystal : readList(section, "crystals")) {
            arena.addCrystal(crystal);
        }

        for (StoredLocation gateway : readList(section, "gateways")) {
            arena.addGateway(gateway);
        }

        ConfigurationSection perches = section.getConfigurationSection("perches");
        if (perches != null) {
            for (String id : perches.getKeys(false)) {
                Perch perch = Perch.read(id, perches.getConfigurationSection(id), settings.perchDefaults());
                if (perch != null) {
                    arena.addPerch(perch);
                }
            }
        }

        arena.egg(StoredLocation.read(section.getConfigurationSection("egg")));

        // Bounds are set before the build record is read: setting them clears the record, so the
        // reverse order would load a thousand tracked blocks and immediately discard them.
        Region bounds = Region.read(section.getConfigurationSection("arena"));
        if (bounds != null) {
            arena.bounds(bounds);
        }

        arena.builds().read(section.getConfigurationSection("builds"));

        return arena;
    }

    private List<StoredLocation> readList(ConfigurationSection section, String key) {
        List<StoredLocation> locations = new ArrayList<>();
        ConfigurationSection list = section.getConfigurationSection(key);

        if (list == null) {
            return locations;
        }

        // Keyed by index rather than stored as a YAML list, because a list of maps is far harder for
        // an operator to edit by hand and impossible to reference from a command.
        for (String index : list.getKeys(false)) {
            StoredLocation location = StoredLocation.read(list.getConfigurationSection(index));
            if (location != null) {
                locations.add(location);
            }
        }

        return locations;
    }


    // ─── Writing ──────────────────────────────────────────────────────────────────────────────

    public void save(Map<String, Arena> arenas) {
        YamlConfiguration document = new YamlConfiguration();
        ConfigurationSection root = document.createSection("arenas");

        for (Arena arena : arenas.values()) {
            writeArena(root.createSection(arena.name()), arena);
        }

        try {
            if (!file.getParentFile().exists() && !file.getParentFile().mkdirs()) {
                plugin.getLogger().warning("Could not create the plugin data folder — arenas were not saved.");
                return;
            }

            document.save(file);
        } catch (IOException error) {
            plugin.getLogger().log(Level.SEVERE,
                    "Could not save arenas.yml — changes made this session will be lost on restart.", error);
        }
    }

    private void writeArena(ConfigurationSection section, Arena arena) {
        section.set("enabled", arena.enabled());

        arena.dragonSpawn().ifPresent(location -> location.write(section.createSection("dragon-spawn")));
        arena.playerSpawn().ifPresent(location -> location.write(section.createSection("player-spawn")));
        arena.portalCentre().ifPresent(location -> location.write(section.createSection("portal")));
        arena.beacon().ifPresent(location -> location.write(section.createSection("beacon")));

        writeList(section, "crystals", arena.crystals());
        writeList(section, "gateways", arena.gateways());

        if (!arena.perches().isEmpty()) {
            ConfigurationSection perches = section.createSection("perches");
            for (Perch perch : arena.perches()) {
                perch.write(perches.createSection(perch.id()));
            }
        }

        arena.egg().ifPresent(location -> location.write(section.createSection("egg")));
        arena.bounds().ifPresent(bounds -> bounds.write(section.createSection("arena")));

        // Only written when there is something to write, so an arena nobody has built in does not
        // carry an empty list around.
        if (arena.builds().size() > 0) {
            arena.builds().write(section.createSection("builds"));
        }

        arena.settings().write(section.createSection("settings"));
    }

    private void writeList(ConfigurationSection section, String key, List<StoredLocation> locations) {
        if (locations.isEmpty()) {
            return;
        }

        ConfigurationSection list = section.createSection(key);
        for (int index = 0; index < locations.size(); index++) {
            locations.get(index).write(list.createSection(String.valueOf(index)));
        }
    }

}
