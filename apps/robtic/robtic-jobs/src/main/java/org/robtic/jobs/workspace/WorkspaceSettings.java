package org.robtic.jobs.workspace;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.registry.Registry;
import org.robtic.core.unlock.UnlockConditions;
import org.robtic.core.util.Ids;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.logging.Logger;

/**
 * Everything {@code workspace.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave the system reading a mix of old and new values.
 */
public final class WorkspaceSettings {

    private final boolean enabled;

    private final int regionRadius;
    private final int regionDepth;
    private final int regionHeight;
    private final int regionPadding;
    private final long maxRegionVolume;

    private final TreeMap<Integer, BaseLevel> baseLevels;
    private final Map<String, WorkspaceUpgrade> upgrades;
    private final Registry<WorkspaceNpcRole> roles;

    private final boolean restrictStorage;
    private final Set<Material> storageWhitelist;
    private final int baseStorage;
    private final String storageUpgradeId;

    private final boolean taxEnabled;
    private final Duration taxInterval;
    private final double taxBase;
    private final Duration taxGrace;

    private final String licenseId;
    private final String managerLicenseId;
    private final Duration licenseGrace;
    private final List<Duration> licenseWarnings;

    private final boolean protectExplosions;
    private final boolean protectFire;
    private final boolean protectFluids;
    private final boolean protectPistons;

    private final int maxWorkspacesFree;
    private final TreeMap<Integer, Integer> maxWorkspacesByTier;

    public WorkspaceSettings(ConfigurationSection root, UnlockConditions conditions, Logger logger) {
        ConfigurationSection config = root == null
                ? new org.bukkit.configuration.MemoryConfiguration()
                : root;

        this.enabled = config.getBoolean("enabled", true);

        ConfigurationSection region = section(config, "region");
        this.regionRadius = Math.max(1, region.getInt("radius", 16));
        this.regionDepth = Math.max(0, region.getInt("depth", 8));
        this.regionHeight = Math.max(1, region.getInt("height", 32));
        this.regionPadding = Math.max(0, region.getInt("marker-padding", 4));
        this.maxRegionVolume = Math.max(1L, region.getLong("max-volume", 250_000L));

        this.baseLevels = readBaseLevels(config.getConfigurationSection("base-levels"), conditions, logger);
        this.upgrades = readUpgrades(config.getConfigurationSection("upgrades"), logger);
        this.roles = readRoles(config.getConfigurationSection("npc-roles"), logger);

        // Roles are parsed before this so a level naming one that does not exist can be reported.
        // Left unchecked, such a level simply staffs nothing: the building is claimed, upgraded and
        // paid for, and no NPC ever appears, with nothing in the console to explain it.
        warnOnUnknownRoles(baseLevels, roles, logger);
        warnOnUnreachableUpgrades(baseLevels, upgrades, logger);

        ConfigurationSection storage = section(config, "storage");
        this.restrictStorage = storage.getBoolean("profession-items-only", true);
        this.storageWhitelist = readMaterials(storage.getStringList("always-allow"), logger);
        this.baseStorage = Math.max(0, storage.getInt("base-capacity", 512));
        this.storageUpgradeId = Ids.normalise(storage.getString("upgrade", "storage"));

        ConfigurationSection tax = section(config, "tax");
        this.taxEnabled = tax.getBoolean("enabled", true);
        this.taxInterval = Duration.ofMinutes(Math.max(1L, tax.getLong("interval-minutes", 10_080L)));
        this.taxBase = org.robtic.core.util.Robs.sanitise(tax.getDouble("base-amount", 500d));
        this.taxGrace = Duration.ofMinutes(Math.max(0L, tax.getLong("grace-minutes", 1_440L)));

        ConfigurationSection license = section(config, "license");
        this.licenseId = Ids.normalise(license.getString("id", "workspace"));
        this.managerLicenseId = Ids.normalise(license.getString("manager-id", "manager"));
        this.licenseGrace = Duration.ofMinutes(Math.max(0L, license.getLong("grace-minutes", 4_320L)));
        this.licenseWarnings = readWarnings(license.getLongList("warn-before-minutes"), logger);

        ConfigurationSection protection = section(config, "protection");
        this.protectExplosions = protection.getBoolean("explosions", true);
        this.protectFire = protection.getBoolean("fire", true);
        this.protectFluids = protection.getBoolean("fluids", true);
        this.protectPistons = protection.getBoolean("pistons", true);

        ConfigurationSection limits = section(config, "limits");
        this.maxWorkspacesFree = Math.max(0, limits.getInt("default", 1));
        this.maxWorkspacesByTier = readLimits(limits.getConfigurationSection("tiers"), logger);
    }

    private static ConfigurationSection section(ConfigurationSection parent, String name) {
        ConfigurationSection found = parent.getConfigurationSection(name);
        return found == null ? new org.bukkit.configuration.MemoryConfiguration() : found;
    }

    // ─── Parsing ──────────────────────────────────────────────────────────────────────────────

    private static TreeMap<Integer, BaseLevel> readBaseLevels(
            ConfigurationSection section,
            UnlockConditions conditions,
            Logger logger
    ) {
        TreeMap<Integer, BaseLevel> levels = new TreeMap<>();

        if (section == null) {
            logger.warning("workspace.yml has no \"base-levels\" section — every business will run at"
                    + " the fallback level (a seller, no workers).");
            return levels;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                BaseLevel.parse(key, body, conditions, logger)
                        .ifPresent(level -> levels.put(level.level(), level));
            }
        }

        // Gaps make an upgrade path unreachable — a business at level 2 with no level 3 configured
        // can never spend anything, and the menu would show a button that does nothing.
        int expected = 1;

        for (int level : levels.keySet()) {
            if (level != expected) {
                logger.warning("workspace.yml → base-levels: level " + expected + " is missing, so"
                        + " nothing can upgrade past level " + (expected - 1) + ".");
                break;
            }
            expected++;
        }

        return levels;
    }

    private static Map<String, WorkspaceUpgrade> readUpgrades(ConfigurationSection section, Logger logger) {
        Map<String, WorkspaceUpgrade> upgrades = new LinkedHashMap<>();

        if (section == null) {
            return upgrades;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                WorkspaceUpgrade.parse(key, body, logger)
                        .ifPresent(upgrade -> upgrades.put(upgrade.id(), upgrade));
            }
        }

        return upgrades;
    }

    /** Reports any base level that staffs a role {@code npc-roles} does not define. */
    private static void warnOnUnknownRoles(
            TreeMap<Integer, BaseLevel> levels,
            Registry<WorkspaceNpcRole> roles,
            Logger logger
    ) {
        for (BaseLevel level : levels.values()) {
            for (String role : level.npcRoles()) {
                if (!roles.has(role)) {
                    logger.warning("workspace.yml → base-levels → " + level.level() + " staffs the"
                            + " role \"" + role + "\", which npc-roles does not define. Nothing will"
                            + " be spawned for it.");
                }
            }
        }
    }

    /**
     * Reports upgrades and steps nothing can ever reach.
     *
     * Two distinct mistakes, and both are invisible at runtime — the upgrade simply never appears in
     * the menu, or appears permanently greyed out, and the operator has no way to tell that from an
     * intentional gate.
     */
    private static void warnOnUnreachableUpgrades(
            TreeMap<Integer, BaseLevel> levels,
            Map<String, WorkspaceUpgrade> upgrades,
            Logger logger
    ) {
        Set<String> everyUnlock = new LinkedHashSet<>();
        levels.values().forEach(level -> everyUnlock.addAll(level.unlocks()));

        int highest = levels.isEmpty() ? 1 : levels.lastKey();

        for (WorkspaceUpgrade upgrade : upgrades.values()) {
            if (!upgrade.requiresUnlock().isEmpty() && !everyUnlock.contains(upgrade.requiresUnlock())) {
                logger.warning("workspace.yml → upgrades → " + upgrade.id() + " requires the unlock \""
                        + upgrade.requiresUnlock() + "\", which no base level grants. It can never be"
                        + " bought.");
            }

            for (WorkspaceUpgrade.Step step : upgrade.steps().values()) {
                if (step.minBaseLevel() > highest) {
                    logger.warning("workspace.yml → upgrades → " + upgrade.id() + " level "
                            + step.level() + " requires base level " + step.minBaseLevel()
                            + ", but the highest configured is " + highest + ". It can never be bought.");
                }

                for (String dependency : step.requires().keySet()) {
                    if (!upgrades.containsKey(dependency)) {
                        logger.warning("workspace.yml → upgrades → " + upgrade.id() + " level "
                                + step.level() + " depends on the upgrade \"" + dependency
                                + "\", which is not defined. It can never be bought.");
                    }
                }
            }
        }
    }

    private static Registry<WorkspaceNpcRole> readRoles(ConfigurationSection section, Logger logger) {
        Registry<WorkspaceNpcRole> roles = new Registry<>("workspace npc role", logger);

        if (section == null) {
            return roles;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                WorkspaceNpcRole.parse(key, body, logger).ifPresent(roles::register);
            }
        }

        return roles;
    }

    /**
     * The points before expiry at which a player is warned, longest first.
     *
     * Sorted here rather than trusted from the file, because the lifecycle service picks the first
     * threshold the remaining time has fallen below and an unsorted list would fire the wrong one.
     */
    private static List<Duration> readWarnings(List<Long> minutes, Logger logger) {
        List<Duration> warnings = new ArrayList<>();

        for (long value : minutes) {
            if (value <= 0) {
                logger.warning("workspace.yml → license → warn-before-minutes: " + value
                        + " is not a positive number of minutes and was ignored.");
                continue;
            }

            warnings.add(Duration.ofMinutes(value));
        }

        if (warnings.isEmpty()) {
            // The shipped set: three days, one day, twelve hours, one hour.
            warnings.addAll(List.of(
                    Duration.ofMinutes(4_320),
                    Duration.ofMinutes(1_440),
                    Duration.ofMinutes(720),
                    Duration.ofMinutes(60)));
        }

        warnings.sort((a, b) -> Long.compare(b.toMillis(), a.toMillis()));
        return List.copyOf(warnings);
    }

    private static Set<Material> readMaterials(List<String> names, Logger logger) {
        Set<Material> materials = new LinkedHashSet<>();

        for (String name : names) {
            Material material = Material.matchMaterial(name.trim().toUpperCase(Locale.ROOT));

            if (material == null) {
                logger.warning("workspace.yml → storage → always-allow: unknown material \""
                        + name + "\", ignored.");
                continue;
            }

            materials.add(material);
        }

        return materials;
    }

    private static TreeMap<Integer, Integer> readLimits(ConfigurationSection section, Logger logger) {
        TreeMap<Integer, Integer> limits = new TreeMap<>();

        if (section == null) {
            limits.put(1, 2);
            limits.put(2, 3);
            return limits;
        }

        for (String key : section.getKeys(false)) {
            try {
                limits.put(Integer.parseInt(key.trim()), Math.max(0, section.getInt(key)));
            } catch (NumberFormatException notANumber) {
                logger.warning("workspace.yml → limits → tiers: \"" + key + "\" is not a tier number.");
            }
        }

        return limits;
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    public int regionRadius() {
        return regionRadius;
    }

    public int regionDepth() {
        return regionDepth;
    }

    public int regionHeight() {
        return regionHeight;
    }

    /**
     * How far protection extends beyond a structure's own corner markers.
     *
     * Only used for a business whose region came from markers — see {@code WorkspaceService#claim}.
     * The radius above is what a claim falls back to when no such region exists, and the two are
     * separate settings because they mean different things: one is the size of an invented box, this
     * is a margin around a real building. Zero protects exactly what the builder marked out.
     */
    public int regionPadding() {
        return regionPadding;
    }

    public long maxRegionVolume() {
        return maxRegionVolume;
    }

    /** The base level for a number, falling back rather than failing — see {@link BaseLevel#FALLBACK}. */
    public BaseLevel base(int level) {
        BaseLevel exact = baseLevels.get(level);

        if (exact != null) {
            return exact;
        }

        // A level above everything configured resolves to the highest rather than the fallback, so
        // lowering the level count in config does not strip unlocks from existing businesses.
        Map.Entry<Integer, BaseLevel> below = baseLevels.floorEntry(level);

        return below != null ? below.getValue() : BaseLevel.FALLBACK;
    }

    /** The level above this one, or empty when it is the top. */
    public Optional<BaseLevel> nextBase(int level) {
        return Optional.ofNullable(baseLevels.higherEntry(level)).map(Map.Entry::getValue);
    }

    public int maxBaseLevel() {
        return baseLevels.isEmpty() ? 1 : baseLevels.lastKey();
    }

    public Collection<BaseLevel> baseLevels() {
        return baseLevels.values();
    }

    public Optional<WorkspaceUpgrade> upgrade(String id) {
        return Optional.ofNullable(upgrades.get(Ids.normalise(id)));
    }

    public Collection<WorkspaceUpgrade> upgrades() {
        return upgrades.values();
    }

    public Registry<WorkspaceNpcRole> roles() {
        return roles;
    }

    public boolean restrictStorage() {
        return restrictStorage;
    }

    /** Materials accepted regardless of the profession filter. */
    public boolean alwaysAllowed(Material material) {
        return storageWhitelist.contains(material);
    }

    /**
     * How much a business holds before buying any storage at all.
     *
     * A floor rather than a starting purchase, so a business that has never invested still works.
     * The storage upgrade adds to it; see {@code WorkspaceService#capacityOf}.
     */
    public int baseStorage() {
        return baseStorage;
    }

    /** Which upgrade grants storage capacity. Configurable so the id is not baked into code. */
    public String storageUpgradeId() {
        return storageUpgradeId;
    }

    public boolean taxEnabled() {
        return taxEnabled;
    }

    public Duration taxInterval() {
        return taxInterval;
    }

    /** What a business at this base level costs per interval. */
    public double taxFor(int level) {
        return org.robtic.core.util.Robs.round(taxBase * base(level).taxMultiplier());
    }

    /** How long after a bill falls due before services are suspended. */
    public Duration taxGrace() {
        return taxGrace;
    }

    /** The licence a business must hold to trade at all. */
    public String licenseId() {
        return licenseId;
    }

    /** The licence required before any worker may be hired. */
    public String managerLicenseId() {
        return managerLicenseId;
    }

    /**
     * How long after the workspace licence lapses before the business is abandoned.
     *
     * The single most consequential number in this file: when it elapses somebody loses everything
     * they built. Three days by default.
     */
    public Duration licenseGrace() {
        return licenseGrace;
    }

    /** When to warn before the licence lapses, longest first. */
    public List<Duration> licenseWarnings() {
        return licenseWarnings;
    }

    public boolean protectExplosions() {
        return protectExplosions;
    }

    public boolean protectFire() {
        return protectFire;
    }

    public boolean protectFluids() {
        return protectFluids;
    }

    public boolean protectPistons() {
        return protectPistons;
    }

    /** How many businesses a player of this premium tier may own. */
    public int maxWorkspaces(int premiumTier) {
        if (premiumTier <= 0) {
            return maxWorkspacesFree;
        }

        Map.Entry<Integer, Integer> entry = maxWorkspacesByTier.floorEntry(premiumTier);

        return entry == null ? maxWorkspacesFree : entry.getValue();
    }
}
