package org.robtic.minecraft.statistics;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.minecraft.statistics.api.StatisticCategory;
import org.robtic.minecraft.statistics.api.StatisticDefinition;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * Everything {@code statistics.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave the system reading a mix of old and new values — the same rule the rest of this plugin's
 * settings classes follow.
 *
 * <h2>Definitions are read here and registered by the module</h2>
 *
 * This class does no registering. It parses, validates and reports; {@link StatisticsSystem} decides
 * what to do with the result. That separation is what lets the config be validated by the build-time
 * checker without a running server, and what keeps "the file said something wrong" and "the registry
 * refused it" as two distinguishable failures.
 */
public final class StatisticsSettings {

    private final boolean enabled;
    private final boolean autoRegister;
    private final long saveIntervalSeconds;
    private final long resetSweepMinutes;
    private final ZoneId zone;

    private final List<StatisticCategory> categories;
    private final List<StatisticDefinition> statistics;

    public StatisticsSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null ? new MemoryConfiguration() : root;

        this.enabled = config.getBoolean("enabled", true);

        // Off by default. An unregistered id is nearly always a typo, and silently creating a second
        // counter beside the real one is the exact failure this module exists to prevent.
        this.autoRegister = config.getBoolean("auto-register", false);

        // Clamped rather than trusted. A zero would flush on every tick and a negative would make
        // the timer never fire, and both are a mistyped digit away.
        this.saveIntervalSeconds = Math.max(15L, config.getLong("save-interval-seconds", 120L));
        this.resetSweepMinutes = Math.max(1L, config.getLong("reset-sweep-minutes", 10L));

        this.zone = zone(config.getString("timezone", "UTC"), logger);

        this.categories = readCategories(config.getConfigurationSection("categories"), logger);
        this.statistics = readStatistics(config.getConfigurationSection("statistics"), logger);
    }

    private static List<StatisticCategory> readCategories(ConfigurationSection section, Logger logger) {
        List<StatisticCategory> categories = new ArrayList<>();

        if (section == null) {
            logger.warning("statistics.yml has no \"categories\" section, so every statistic will be "
                    + "grouped under \"" + StatisticCategory.DEFAULT + "\".");
            return categories;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                StatisticCategory.parse(key, body, logger).ifPresent(categories::add);
            }
        }

        return categories;
    }

    private static List<StatisticDefinition> readStatistics(ConfigurationSection section, Logger logger) {
        List<StatisticDefinition> statistics = new ArrayList<>();

        if (section == null) {
            logger.warning("statistics.yml has no \"statistics\" section — nothing will be recorded "
                    + "unless another plugin registers definitions from code.");
            return statistics;
        }

        for (String key : section.getKeys(false)) {
            StatisticDefinition.parse(key, section.getConfigurationSection(key), logger)
                    .ifPresent(statistics::add);
        }

        return statistics;
    }

    /** A bad timezone falls back to UTC rather than throwing during a reload. */
    private static ZoneId zone(String raw, Logger logger) {
        try {
            return ZoneId.of(raw);
        } catch (RuntimeException unknown) {
            logger.warning("statistics.yml names the unknown timezone \"" + raw + "\". Using UTC — "
                    + "daily and weekly resets will roll over at UTC midnight.");
            return ZoneId.of("UTC");
        }
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    public boolean autoRegister() {
        return autoRegister;
    }

    public long saveIntervalSeconds() {
        return saveIntervalSeconds;
    }

    public long resetSweepMinutes() {
        return resetSweepMinutes;
    }

    public ZoneId zone() {
        return zone;
    }

    public List<StatisticCategory> categories() {
        return List.copyOf(categories);
    }

    public List<StatisticDefinition> statistics() {
        return List.copyOf(statistics);
    }
}
