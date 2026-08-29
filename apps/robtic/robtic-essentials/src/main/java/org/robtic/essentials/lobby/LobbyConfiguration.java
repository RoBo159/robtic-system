package org.robtic.essentials.lobby;

import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * `lobby.yml` — the lobby world, its hotbar items, its restrictions and the information menu.
 *
 * <h2>Everything the lobby does is configured, not compiled</h2>
 *
 * The world name, every hotbar slot, which restrictions apply, which commands survive them, and
 * every information-menu entry are read from here. An operator changing the lobby world name or
 * moving the profile item to a different slot should never need a plugin build.
 *
 * Parsed once per reload into an immutable object, exactly as the other settings classes are, so a
 * reload swaps the whole configuration at once rather than leaving the lobby half-applied.
 */
public final class LobbyConfiguration {

    /** One configured hotbar item and the action clicking it performs. */
    public record LobbyItem(String id, int slot, Material material, String name, List<String> lore, String action) {
    }

    /** One row of the information menu. */
    public record InfoEntry(int slot, Material material, String name, List<String> lore, String action, String value) {
    }

    private final boolean enabled;
    private final String world;

    private final Map<String, LobbyItem> items;
    private final Set<String> allowedCommands;
    private final Set<String> restrictions;

    private final List<InfoEntry> infoEntries;

    private final String menuTitleLobbyPlayer;
    private final String menuTitleGive;
    private final String menuTitleInfo;
    private final String menuTitleSettings;
    private final String menuTitlePreview;

    private final Sound clickSound;
    private final long interactCooldownMillis;

    /**
     * Parsed by {@code ConfigRegistry}, which lives in another package — hence a factory rather
     * than the package-private constructor the other settings classes use.
     */
    public static LobbyConfiguration parse(FileConfiguration config, Logger logger) {
        return new LobbyConfiguration(config, logger);
    }

    private LobbyConfiguration(FileConfiguration config, Logger logger) {
        this.enabled = config.getBoolean("enabled", true);
        this.world = config.getString("world", "spawn");

        this.items = parseItems(config.getConfigurationSection("items"), logger);
        this.allowedCommands = lower(config.getStringList("allowed-commands"));
        this.restrictions = lower(config.getStringList("restrictions"));
        this.infoEntries = parseInfo(config.getConfigurationSection("information.entries"), logger);

        this.menuTitleLobbyPlayer = config.getString("titles.player", "&8Player");
        this.menuTitleGive = config.getString("titles.give", "&8Give item");
        this.menuTitleInfo = config.getString("titles.information", "&8Information");
        this.menuTitleSettings = config.getString("titles.settings", "&8Settings");
        this.menuTitlePreview = config.getString("titles.preview", "&8Survival inventory");

        this.clickSound = sound(config.getString("sounds.click", "UI_BUTTON_CLICK"), logger);
        this.interactCooldownMillis = config.getLong("interact-cooldown-ms", 500L);
    }

    public boolean enabled() {
        return enabled;
    }

    public String world() {
        return world;
    }

    /** True when the named world is the lobby. The single check every lobby feature gates on. */
    public boolean isLobby(String worldName) {
        return enabled && world.equalsIgnoreCase(worldName);
    }

    public Map<String, LobbyItem> items() {
        return items;
    }

    public Optional<LobbyItem> itemAt(int slot) {
        return items.values().stream().filter(item -> item.slot() == slot).findFirst();
    }

    /**
     * Whether a command may be used in the lobby.
     *
     * An empty allow-list means "no restriction", which is what makes the feature opt-in: an
     * operator who has not configured it does not suddenly find every command blocked.
     */
    public boolean commandAllowed(String label) {
        return allowedCommands.isEmpty() || allowedCommands.contains(label.toLowerCase(Locale.ROOT));
    }

    /**
     * Whether one named restriction is active.
     *
     * Listing them rather than hardcoding lets an operator run a lobby that permits, say, item
     * pickup for an event without a plugin change. An empty list applies *every* restriction —
     * the safe default for a lobby.
     */
    public boolean restricts(String key) {
        return restrictions.isEmpty() || restrictions.contains(key.toLowerCase(Locale.ROOT));
    }

    public List<InfoEntry> infoEntries() {
        return infoEntries;
    }

    public String playerMenuTitle() {
        return menuTitleLobbyPlayer;
    }

    public String giveMenuTitle() {
        return menuTitleGive;
    }

    public String infoMenuTitle() {
        return menuTitleInfo;
    }

    public String settingsMenuTitle() {
        return menuTitleSettings;
    }

    public String previewMenuTitle() {
        return menuTitlePreview;
    }

    public Optional<Sound> clickSound() {
        return Optional.ofNullable(clickSound);
    }

    public long interactCooldownMillis() {
        return interactCooldownMillis;
    }

    // ─── Parsing ──────────────────────────────────────────────────────────────────────────────

    private static Map<String, LobbyItem> parseItems(ConfigurationSection section, Logger logger) {
        Map<String, LobbyItem> parsed = new LinkedHashMap<>();

        if (section == null) {
            return Map.copyOf(parsed);
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection item = section.getConfigurationSection(key);
            if (item == null) {
                continue;
            }

            Material material = material(item.getString("material", "STONE"), logger, key);
            if (material == null) {
                continue;
            }

            parsed.put(key.toLowerCase(Locale.ROOT), new LobbyItem(
                    key.toLowerCase(Locale.ROOT),
                    // Clamped to the hotbar: a slot outside it would silently never appear.
                    Math.max(0, Math.min(8, item.getInt("slot", 0))),
                    material,
                    item.getString("name", "&f" + key),
                    List.copyOf(item.getStringList("lore")),
                    item.getString("action", key).toLowerCase(Locale.ROOT)));
        }

        return Map.copyOf(parsed);
    }

    private static List<InfoEntry> parseInfo(ConfigurationSection section, Logger logger) {
        List<InfoEntry> parsed = new ArrayList<>();

        if (section == null) {
            return List.copyOf(parsed);
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection entry = section.getConfigurationSection(key);
            if (entry == null) {
                continue;
            }

            Material material = material(entry.getString("material", "PAPER"), logger, key);
            if (material == null) {
                continue;
            }

            parsed.add(new InfoEntry(
                    entry.getInt("slot", parsed.size()),
                    material,
                    entry.getString("name", "&f" + key),
                    List.copyOf(entry.getStringList("lore")),
                    entry.getString("action", "none").toLowerCase(Locale.ROOT),
                    entry.getString("value", "")));
        }

        return List.copyOf(parsed);
    }

    /** An unknown material is skipped with a warning rather than crashing the whole config load. */
    private static Material material(String name, Logger logger, String key) {
        Material material = Material.matchMaterial(name.toUpperCase(Locale.ROOT));

        if (material == null) {
            logger.warning("lobby.yml: \"" + name + "\" is not a valid material (entry \"" + key + "\") — skipped.");
        }

        return material;
    }

    private static Sound sound(String name, Logger logger) {
        if (name == null || name.isBlank()) {
            return null;
        }

        try {
            // Sound is a registry-backed enum in modern Paper; valueOf still resolves the constants.
            return Sound.valueOf(name.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning("lobby.yml: \"" + name + "\" is not a valid sound — no click sound will play.");
            return null;
        }
    }

    private static Set<String> lower(List<String> values) {
        return Set.copyOf(values.stream().map(value -> value.toLowerCase(Locale.ROOT).trim()).toList());
    }
}
