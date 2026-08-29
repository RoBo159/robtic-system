package org.robtic.world.config;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.world.api.MarkerCategory;
import org.robtic.world.api.MarkerType;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Everything {@code markers.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave the system reading a mix of old and new values — the rule every settings class in this
 * plugin follows.
 *
 * <h2>The two materials</h2>
 *
 * A marker is one block while it is being designed and a different one after it has been read. Both
 * are configurable and both are validated here rather than at the point of use, so a server that
 * picks something impossible finds out at load with a line naming the key, instead of at 3am when a
 * structure generates.
 */
public final class MarkerSettings {

    private final boolean enabled;
    private final boolean scanOnGenerate;

    private final Material blockMaterial;
    private final Material clearedMaterial;
    private final boolean keepBlocks;

    private final int scanRadius;
    private final long maxVolume;

    private final int menuRows;
    private final String menuTitle;

    private final Set<String> worlds;

    private final List<MarkerCategory> categories;
    private final List<MarkerType> types;

    public MarkerSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null ? new MemoryConfiguration() : root;

        this.enabled = config.getBoolean("enabled", true);
        this.scanOnGenerate = config.getBoolean("scan-on-generate", true);

        ConfigurationSection marker = section(config, "marker");

        // A sign, because of the blocks that can hold persistent data it is the only one with no
        // collision box — so a marker is walk-through even while a builder is still placing them.
        //
        // A warped sign specifically, and not an oak one. Every chunk load checks its block entities
        // against this material before doing anything more expensive, and oak signs are in villages,
        // mineshafts, shipwrecks and every player's shop. Nether wood appears in no overworld
        // structure, so the cheap comparison rejects essentially everything and the container read
        // almost never runs on a block that is not ours.
        this.blockMaterial = material(marker.getString("block", "WARPED_SIGN"),
                Material.WARPED_SIGN, "marker.block", logger);

        this.keepBlocks = marker.getBoolean("keep-after-scan", false);

        // Structure void rather than air, so a marker that has been read still shows up in a
        // structure-block preview when somebody is working out why a building did not register.
        this.clearedMaterial = material(marker.getString("cleared-to", "STRUCTURE_VOID"),
                Material.STRUCTURE_VOID, "marker.cleared-to", logger);

        ConfigurationSection scan = section(config, "scan");

        // Clamped: a radius of zero finds nothing, and one large enough to cross chunk borders in
        // bulk turns a structure generating into a visible freeze.
        this.scanRadius = Math.max(8, Math.min(128, scan.getInt("radius", 48)));
        this.maxVolume = Math.max(0L, scan.getLong("max-volume", 500_000L));
        this.worlds = Set.copyOf(scan.getStringList("worlds"));

        ConfigurationSection gui = section(config, "gui");

        this.menuRows = Math.max(3, Math.min(6, gui.getInt("rows", 6)));
        this.menuTitle = gui.getString("title", "&6Structure Markers");

        this.categories = readCategories(config.getConfigurationSection("categories"), logger);
        this.types = readTypes(config.getConfigurationSection("types"), logger);
    }

    private static ConfigurationSection section(ConfigurationSection parent, String name) {
        ConfigurationSection found = parent.getConfigurationSection(name);
        return found == null ? new MemoryConfiguration() : found;
    }

    /**
     * Resolves a material, falling back rather than throwing.
     *
     * A misspelled material is an operator's typo and must not be the reason the marker system fails
     * to load — with no marker block, nothing can be placed and no structure can ever be read.
     */
    private static Material material(String raw, Material fallback, String key, Logger logger) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }

        Material found = Material.matchMaterial(raw.trim().toUpperCase(Locale.ROOT));

        if (found == null) {
            logger.warning("markers.yml → " + key + ": \"" + raw + "\" is not a material, using "
                    + fallback + ".");
            return fallback;
        }

        return found;
    }

    private static List<MarkerCategory> readCategories(ConfigurationSection section, Logger logger) {
        List<MarkerCategory> categories = new ArrayList<>();

        if (section == null) {
            return categories;
        }

        for (String key : section.getKeys(false)) {
            MarkerCategory.parse(key, section.getConfigurationSection(key), logger)
                    .ifPresent(categories::add);
        }

        return categories;
    }

    private static List<MarkerType> readTypes(ConfigurationSection section, Logger logger) {
        List<MarkerType> types = new ArrayList<>();

        if (section == null) {
            logger.warning("markers.yml has no \"types\" section, so no marker can be placed unless"
                    + " another module registers one from code.");
            return types;
        }

        for (String key : section.getKeys(false)) {
            MarkerType.parse(key, section.getConfigurationSection(key), logger).ifPresent(types::add);
        }

        return types;
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    /** Whether generated structures are scanned automatically as their chunks load. */
    public boolean scanOnGenerate() {
        return scanOnGenerate;
    }

    /** The block a marker is while it is being designed and while it sits in a schematic. */
    public Material blockMaterial() {
        return blockMaterial;
    }

    /** What a marker block becomes once it has been read. */
    public Material clearedMaterial() {
        return clearedMaterial;
    }

    /**
     * Whether marker blocks survive being read.
     *
     * Off by default, because the requirement is that markers are invisible during play. On, they
     * stay exactly where they are — which is what a builder wants in a development world, where
     * being able to re-run validation on the real blocks is worth more than them being invisible.
     */
    public boolean keepBlocks() {
        return keepBlocks;
    }

    public int scanRadius() {
        return scanRadius;
    }

    public long maxVolume() {
        return maxVolume;
    }

    /** Worlds where generated structures are scanned. Empty means every world. */
    public Set<String> worlds() {
        return worlds;
    }

    public boolean scans(String world) {
        return worlds.isEmpty() || worlds.contains(world);
    }

    public int menuRows() {
        return menuRows;
    }

    public String menuTitle() {
        return menuTitle;
    }

    public List<MarkerCategory> categories() {
        return List.copyOf(categories);
    }

    public List<MarkerType> types() {
        return List.copyOf(types);
    }
}
