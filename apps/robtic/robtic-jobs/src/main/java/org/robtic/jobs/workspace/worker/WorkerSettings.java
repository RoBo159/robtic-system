package org.robtic.jobs.workspace.worker;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.core.util.Ids;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Everything {@code workers.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave one profession yielding by the new table and another by the old.
 */
public final class WorkerSettings {

    /**
     * One thing a profession's worker produces per yield.
     *
     * @param material what it produces
     * @param amount   how many per interval, before the chance roll
     * @param chance   0..1. Below one, the whole entry is skipped on a failed roll rather than being
     *                 scaled down — a worker that produced 0.3 diamonds an hour would be a rounding
     *                 argument, and one that produces a diamond three hours in ten is a rate anybody
     *                 can reason about
     */
    public record Yield(Material material, int amount, double chance) {

        public Yield {
            amount = Math.max(0, amount);
            chance = chance <= 0 ? 0d : Math.min(1d, chance);
        }
    }

    private final boolean enabled;

    private final String npcDefinition;
    private final double npcSpacing;

    private final double npcHireCost;
    private final double npcSalary;

    private final Duration payInterval;
    private final Duration maintenanceInterval;
    private final double maintenanceCost;

    private final Duration yieldInterval;
    private final int maxCatchUpIntervals;

    private final Map<String, List<Yield>> yields;

    public WorkerSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null ? new MemoryConfiguration() : root;

        this.enabled = config.getBoolean("enabled", true);

        ConfigurationSection npc = section(config, "npc");
        this.npcDefinition = Ids.normalise(npc.getString("definition", "workspace_worker"));
        this.npcSpacing = Math.max(0.5d, npc.getDouble("spacing", 2.5d));
        this.npcHireCost = org.robtic.core.util.Robs.sanitise(npc.getDouble("hire-cost", 50_000d));
        this.npcSalary = org.robtic.core.util.Robs.sanitise(npc.getDouble("salary", 500d));

        ConfigurationSection wages = section(config, "wages");
        this.payInterval = Duration.ofMinutes(Math.max(1L, wages.getLong("interval-minutes", 1_440L)));

        ConfigurationSection maintenance = section(config, "maintenance");
        this.maintenanceInterval = Duration.ofMinutes(
                Math.max(1L, maintenance.getLong("interval-minutes", 10_080L)));
        this.maintenanceCost =
                org.robtic.core.util.Robs.sanitise(maintenance.getDouble("cost", 2_000d));

        ConfigurationSection yield = section(config, "yield");
        this.yieldInterval = Duration.ofMinutes(Math.max(1L, yield.getLong("interval-minutes", 30L)));

        // Bounds what a long absence can pay out in one go. Without it, a server down for a week
        // credits every worker a week of output the instant it comes back, which is both a shock to
        // the economy and indistinguishable from a duplication bug.
        this.maxCatchUpIntervals = Math.max(1, yield.getInt("max-catch-up-intervals", 48));

        this.yields = readYields(yield.getConfigurationSection("professions"), logger);
    }

    private static ConfigurationSection section(ConfigurationSection parent, String name) {
        ConfigurationSection found = parent.getConfigurationSection(name);
        return found == null ? new MemoryConfiguration() : found;
    }

    private static Map<String, List<Yield>> readYields(ConfigurationSection section, Logger logger) {
        Map<String, List<Yield>> yields = new LinkedHashMap<>();

        if (section == null) {
            logger.warning("workers.yml has no yield → professions section, so NPC workers will"
                    + " produce nothing. They can still be hired and will still be paid.");
            return yields;
        }

        for (String profession : section.getKeys(false)) {
            List<Yield> produced = new ArrayList<>();

            for (Map<?, ?> raw : section.getMapList(profession)) {
                String name = String.valueOf(raw.get("material")).trim().toUpperCase(Locale.ROOT);
                Material material = Material.matchMaterial(name);

                if (material == null) {
                    logger.warning("workers.yml → yield → professions → " + profession
                            + ": unknown material \"" + name + "\", ignored.");
                    continue;
                }

                produced.add(new Yield(
                        material,
                        raw.get("amount") instanceof Number amount ? amount.intValue() : 1,
                        raw.get("chance") instanceof Number chance ? chance.doubleValue() : 1.0d));
            }

            yields.put(Ids.normalise(profession), List.copyOf(produced));
        }

        return yields;
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    /** The npc.yml definition a worker's figure is spawned from. */
    public String npcDefinition() {
        return npcDefinition;
    }

    /** How far apart worker figures stand, so several do not occupy one block. */
    public double npcSpacing() {
        return npcSpacing;
    }

    /** What it costs to take on an NPC worker. */
    public double npcHireCost() {
        return npcHireCost;
    }

    /** What an NPC worker is paid per {@link #payInterval()}. */
    public double npcSalary() {
        return npcSalary;
    }

    public Duration payInterval() {
        return payInterval;
    }

    public Duration maintenanceInterval() {
        return maintenanceInterval;
    }

    public double maintenanceCost() {
        return maintenanceCost;
    }

    public Duration yieldInterval() {
        return yieldInterval;
    }

    /** The ceiling on how many intervals one catch-up may pay. See the field's own note. */
    public int maxCatchUpIntervals() {
        return maxCatchUpIntervals;
    }

    /**
     * What a profession's worker produces per interval.
     *
     * An empty list for a profession nobody configured, which is a worker that costs wages and
     * produces nothing — visible to its owner, and the operator's decision rather than a crash.
     */
    public List<Yield> yieldFor(String professionId) {
        return yields.getOrDefault(Ids.normalise(professionId), List.of());
    }

    /** Every profession with a yield table, for the config check. */
    public java.util.Set<String> professionsWithYield() {
        return yields.keySet();
    }
}
