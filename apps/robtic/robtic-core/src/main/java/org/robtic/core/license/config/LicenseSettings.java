package org.robtic.core.license.config;

import org.bukkit.Sound;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.core.license.api.License;
import org.robtic.core.license.api.LicenseCategory;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * Everything {@code licenses.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave the system reading a mix of old and new values — the same rule every other settings class in
 * this plugin follows.
 *
 * <h2>Definitions are read here and registered by the module</h2>
 *
 * This class parses, validates and reports; {@code LicenseSystem} decides what to do with the
 * result. That keeps "the file said something wrong" and "the registry refused it" as two
 * distinguishable failures, and lets the file be checked without a running server.
 */
public final class LicenseSettings {

    private final boolean enabled;
    private final int browserRows;
    private final String browserTitle;

    private final Sound openSound;
    private final Sound renewSound;
    private final Sound deniedSound;

    private final boolean particlesOnRenew;

    private final List<LicenseCategory> categories;
    private final List<License> licenses;

    public LicenseSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null ? new MemoryConfiguration() : root;

        this.enabled = config.getBoolean("enabled", true);

        ConfigurationSection gui = section(config, "gui");

        // Clamped to what an inventory can actually be. A value outside 1..6 throws when the
        // inventory is created, which would take the browser down for a mistyped digit.
        this.browserRows = Math.max(3, Math.min(6, gui.getInt("rows", 6)));
        this.browserTitle = gui.getString("title", "&6Robtic Licences");

        ConfigurationSection sounds = section(config, "sounds");

        this.openSound = sound(sounds.getString("open", "BLOCK_ENDER_CHEST_OPEN"), logger);
        this.renewSound = sound(sounds.getString("renew", "ENTITY_PLAYER_LEVELUP"), logger);
        this.deniedSound = sound(sounds.getString("denied", "BLOCK_NOTE_BLOCK_BASS"), logger);

        this.particlesOnRenew = section(config, "particles").getBoolean("on-renew", true);

        this.categories = readCategories(config.getConfigurationSection("categories"), logger);
        this.licenses = readLicenses(config.getConfigurationSection("licenses"), logger);
    }

    private static ConfigurationSection section(ConfigurationSection parent, String name) {
        ConfigurationSection found = parent.getConfigurationSection(name);
        return found == null ? new MemoryConfiguration() : found;
    }

    /**
     * Resolves a sound, falling back to none rather than throwing.
     *
     * <h2>Why the catch is this wide</h2>
     *
     * A misspelled sound is an operator's typo and yields {@link IllegalArgumentException}, which is
     * the obvious case. The one that is not obvious is that {@code Sound} is registry-backed on
     * modern Paper: resolving one before the server's registries exist throws
     * {@link ExceptionInInitializerError}, which is an {@link Error} and would sail straight past a
     * narrower catch.
     *
     * That is not hypothetical — it is what happens the moment this class is constructed anywhere
     * other than inside a running server, which includes every test of the configuration. A
     * decorative sound must not be the reason licences fail to load, so nothing thrown here escapes.
     */
    private static Sound sound(String raw, Logger logger) {
        if (raw == null || raw.isBlank() || raw.equalsIgnoreCase("none")) {
            return null;
        }

        try {
            @SuppressWarnings("deprecation")
            Sound resolved = Sound.valueOf(raw.trim().toUpperCase(Locale.ROOT));
            return resolved;
        } catch (IllegalArgumentException unknown) {
            logger.warning("licenses.yml → sounds: unknown sound \"" + raw + "\", ignored.");
            return null;
        } catch (RuntimeException | LinkageError unavailable) {
            // The sound registry is not available. Silent rather than warned: on a real server this
            // does not happen, and warning would put a confusing line in front of anybody running
            // the configuration through a test harness.
            return null;
        }
    }

    private static List<LicenseCategory> readCategories(ConfigurationSection section, Logger logger) {
        List<LicenseCategory> categories = new ArrayList<>();

        if (section == null) {
            logger.warning("licenses.yml has no \"categories\" section, so every licence will be"
                    + " grouped under \"" + LicenseCategory.DEFAULT + "\".");
            return categories;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                LicenseCategory.parse(key, body, logger).ifPresent(categories::add);
            }
        }

        return categories;
    }

    private static List<License> readLicenses(ConfigurationSection section, Logger logger) {
        List<License> licenses = new ArrayList<>();

        if (section == null) {
            logger.warning("licenses.yml has no \"licenses\" section — no licence can be issued"
                    + " unless another plugin registers one from code.");
            return licenses;
        }

        for (String key : section.getKeys(false)) {
            License.parse(key, section.getConfigurationSection(key), logger).ifPresent(licenses::add);
        }

        return licenses;
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    public int browserRows() {
        return browserRows;
    }

    public String browserTitle() {
        return browserTitle;
    }

    public Optional<Sound> openSound() {
        return Optional.ofNullable(openSound);
    }

    public Optional<Sound> renewSound() {
        return Optional.ofNullable(renewSound);
    }

    public Optional<Sound> deniedSound() {
        return Optional.ofNullable(deniedSound);
    }

    public boolean particlesOnRenew() {
        return particlesOnRenew;
    }

    public List<LicenseCategory> categories() {
        return List.copyOf(categories);
    }

    public List<License> licenses() {
        return List.copyOf(licenses);
    }
}
