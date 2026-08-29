package org.robtic.minecraft.progression.workspace;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.robtic.minecraft.progression.api.Registry;

import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Locale;
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
    private final long maxRegionVolume;

    private final TreeMap<Integer, WorkspaceTier> tiers;
    private final Registry<WorkspaceNpcRole> roles;

    private final boolean restrictStorage;
    private final Set<Material> storageWhitelist;

    private final boolean taxEnabled;
    private final Duration taxInterval;
    private final double taxBase;
    private final Duration taxGrace;

    private final boolean protectExplosions;
    private final boolean protectFire;
    private final boolean protectFluids;
    private final boolean protectPistons;

    private final int maxWorkspacesFree;
    private final TreeMap<Integer, Integer> maxWorkspacesByTier;

    public WorkspaceSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null
                ? new org.bukkit.configuration.MemoryConfiguration()
                : root;

        this.enabled = config.getBoolean("enabled", true);

        ConfigurationSection region = section(config, "region");
        this.regionRadius = Math.max(1, region.getInt("radius", 16));
        this.regionDepth = Math.max(0, region.getInt("depth", 8));
        this.regionHeight = Math.max(1, region.getInt("height", 32));
        this.maxRegionVolume = Math.max(1L, region.getLong("max-volume", 250_000L));

        this.tiers = readTiers(config.getConfigurationSection("tiers"), logger);
        this.roles = readRoles(config.getConfigurationSection("npc-roles"), logger);

        // Roles are parsed before this so a tier naming one that does not exist can be reported.
        // Left unchecked, such a tier simply staffs nothing: the building is claimed, upgraded and
        // paid for, and no NPC ever appears, with nothing in the console to explain it.
        warnOnUnknownRoles(tiers, roles, logger);

        ConfigurationSection storage = section(config, "storage");
        this.restrictStorage = storage.getBoolean("profession-items-only", true);
        this.storageWhitelist = readMaterials(storage.getStringList("always-allow"), logger);

        ConfigurationSection tax = section(config, "tax");
        this.taxEnabled = tax.getBoolean("enabled", true);
        this.taxInterval = Duration.ofMinutes(Math.max(1L, tax.getLong("interval-minutes", 10_080L)));
        this.taxBase = org.robtic.minecraft.util.Robs.sanitise(tax.getDouble("base-amount", 500d));
        this.taxGrace = Duration.ofMinutes(Math.max(0L, tax.getLong("grace-minutes", 1_440L)));

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

    private static TreeMap<Integer, WorkspaceTier> readTiers(ConfigurationSection section, Logger logger) {
        TreeMap<Integer, WorkspaceTier> tiers = new TreeMap<>();

        if (section == null) {
            logger.warning("workspace.yml has no \"tiers\" section — every workspace will run at the "
                    + "fallback tier (512 storage, seller only).");
            return tiers;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                WorkspaceTier.parse(key, body, logger).ifPresent(tier -> tiers.put(tier.level(), tier));
            }
        }

        // Gaps make an upgrade path unreachable — a player at tier 2 with no tier 3 configured can
        // never spend anything, and the menu would show a button that does nothing.
        int expected = 1;

        for (int level : tiers.keySet()) {
            if (level != expected) {
                logger.warning("workspace.yml → tiers: level " + expected + " is missing, so nothing "
                        + "can upgrade past level " + (expected - 1) + ".");
                break;
            }
            expected++;
        }

        return tiers;
    }

    /** Reports any tier that staffs a role {@code npc-roles} does not define. */
    private static void warnOnUnknownRoles(
            TreeMap<Integer, WorkspaceTier> tiers,
            Registry<WorkspaceNpcRole> roles,
            Logger logger
    ) {
        for (WorkspaceTier tier : tiers.values()) {
            for (String role : tier.npcRoles()) {
                if (!roles.has(role)) {
                    logger.warning("workspace.yml → tiers → " + tier.level() + " staffs the role \""
                            + role + "\", which npc-roles does not define. Nothing will be spawned "
                            + "for it.");
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

    private static Set<Material> readMaterials(java.util.List<String> names, Logger logger) {
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

    public long maxRegionVolume() {
        return maxRegionVolume;
    }

    /** The tier for a level, falling back rather than failing — see {@link WorkspaceTier#FALLBACK}. */
    public WorkspaceTier tier(int level) {
        WorkspaceTier exact = tiers.get(level);

        if (exact != null) {
            return exact;
        }

        // A level above everything configured resolves to the highest tier rather than the fallback,
        // so lowering the tier count in config does not strip capabilities from existing workspaces.
        java.util.Map.Entry<Integer, WorkspaceTier> below = tiers.floorEntry(level);

        return below != null ? below.getValue() : WorkspaceTier.FALLBACK;
    }

    /** The tier above this one, or empty when it is the top. */
    public Optional<WorkspaceTier> nextTier(int level) {
        return Optional.ofNullable(tiers.higherEntry(level)).map(java.util.Map.Entry::getValue);
    }

    public int maxTier() {
        return tiers.isEmpty() ? 1 : tiers.lastKey();
    }

    public java.util.Collection<WorkspaceTier> tiers() {
        return tiers.values();
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

    public boolean taxEnabled() {
        return taxEnabled;
    }

    public Duration taxInterval() {
        return taxInterval;
    }

    /** What this tier's workspace costs per interval. */
    public double taxFor(int level) {
        return org.robtic.minecraft.util.Robs.round(taxBase * tier(level).taxMultiplier());
    }

    /** How long after a bill falls due before services are suspended. */
    public Duration taxGrace() {
        return taxGrace;
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

    /** How many workspaces a player of this premium tier may own. */
    public int maxWorkspaces(int premiumTier) {
        if (premiumTier <= 0) {
            return maxWorkspacesFree;
        }

        java.util.Map.Entry<Integer, Integer> entry = maxWorkspacesByTier.floorEntry(premiumTier);

        return entry == null ? maxWorkspacesFree : entry.getValue();
    }
}
