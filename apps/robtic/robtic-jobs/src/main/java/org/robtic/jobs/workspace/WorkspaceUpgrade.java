package org.robtic.jobs.workspace;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.util.Ids;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.logging.Logger;

/**
 * Something a business buys, level by level, independently of its headquarters.
 *
 * <h2>The second axis</h2>
 *
 * A {@link BaseLevel} is what a business <em>is</em>; an upgrade is what it <em>has</em>. Storage,
 * a mailbox, a market stall, a tax office, a workshop, decorations — each climbs on its own, at its
 * own cost, and a player chooses which to invest in.
 *
 * The two axes meet at {@link Step#minBaseLevel}: Storage IV requiring base level 4 is one number in
 * this file, and it is the only coupling between them. That is what the brief asks for and it is
 * also what keeps the systems separable — raising a storage tier's requirement changes nothing about
 * base levels, and adding a base level changes nothing here.
 *
 * <h2>Why a step carries one anonymous value</h2>
 *
 * {@link Step#value} is "how much of this you get" — items of capacity for storage, a percentage for
 * a tax office, a count for a workshop. It is deliberately untyped, because the alternative is a
 * field per upgrade on this record and a code change every time a new one is invented, which is the
 * thing this design exists to avoid. The system that owns an upgrade knows what its number means;
 * nothing here needs to.
 *
 * @param id             lowercase identifier, used in configuration and stored on the workspace
 * @param display        shown in the menu
 * @param icon           the menu item
 * @param description    lore lines shown under the name
 * @param requiresUnlock a base-level unlock that must be present before this upgrade is offered at
 *                       all, or blank when it is always available
 * @param steps          level → what that level costs and gives, 1-based and contiguous
 */
public record WorkspaceUpgrade(
        String id,
        String display,
        Material icon,
        List<String> description,
        String requiresUnlock,
        TreeMap<Integer, Step> steps
) {

    /**
     * One purchasable level of an upgrade.
     *
     * @param level        1-based
     * @param cost         Robs to reach this level from the one below, not cumulative
     * @param minBaseLevel the headquarters level required before this step may be bought
     * @param value        what this level grants; see the class notes on why it is untyped
     * @param requires     other upgrades that must already be at a level — upgrade id → minimum.
     *                     A workshop needing storage III is expressed here rather than in code
     */
    public record Step(
            int level,
            double cost,
            int minBaseLevel,
            double value,
            Map<String, Integer> requires
    ) {

        public Step {
            level = Math.max(1, level);
            cost = org.robtic.core.util.Robs.sanitise(cost);
            minBaseLevel = Math.max(1, minBaseLevel);
            requires = Map.copyOf(requires);
        }
    }

    public WorkspaceUpgrade {
        id = Ids.normalise(id);
        description = List.copyOf(description);
        requiresUnlock = requiresUnlock == null ? "" : requiresUnlock.trim().toLowerCase(Locale.ROOT);
        steps = new TreeMap<>(steps);
    }

    /** The highest level configured, or zero for an upgrade with no steps at all. */
    public int maxLevel() {
        return steps.isEmpty() ? 0 : steps.lastKey();
    }

    public Optional<Step> step(int level) {
        return Optional.ofNullable(steps.get(level));
    }

    /** The step that would be bought next, or empty when the upgrade is maxed. */
    public Optional<Step> next(int currentLevel) {
        return Optional.ofNullable(steps.higherEntry(currentLevel)).map(Map.Entry::getValue);
    }

    /**
     * What this upgrade grants at a level.
     *
     * Level zero — never bought — is worth nothing, which is what makes every consumer's arithmetic
     * identical whether or not the player has invested here.
     */
    public double valueAt(int level) {
        if (level <= 0) {
            return 0d;
        }

        // Falls back to the highest configured step rather than to zero. Lowering an upgrade's max
        // level in config must not strip a business of capacity it already paid for.
        Map.Entry<Integer, Step> at = steps.floorEntry(level);

        return at == null ? 0d : at.getValue().value();
    }

    /** Whether this upgrade is offered at all, given a base level's unlocks. */
    public boolean availableAt(BaseLevel base) {
        return requiresUnlock.isEmpty() || base.unlocks(requiresUnlock);
    }

    public static Optional<WorkspaceUpgrade> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);

        if (!Ids.valid(id)) {
            logger.warning("workspace.yml → upgrades: \"" + key + "\" is not a usable id — "
                    + Ids.describeProblem(key) + ". It was ignored.");
            return Optional.empty();
        }

        ConfigurationSection levels = body.getConfigurationSection("levels");

        if (levels == null || levels.getKeys(false).isEmpty()) {
            logger.warning("workspace.yml → upgrades → " + id + " has no \"levels\" section, so there"
                    + " is nothing to buy. It was ignored.");
            return Optional.empty();
        }

        TreeMap<Integer, Step> steps = readSteps(levels, id, logger);

        if (steps.isEmpty()) {
            return Optional.empty();
        }

        Material icon = Material.matchMaterial(
                body.getString("icon", "CHEST").trim().toUpperCase(Locale.ROOT));

        if (icon == null) {
            logger.warning("workspace.yml → upgrades → " + id + " names the unknown material \""
                    + body.getString("icon") + "\". A chest is used instead.");
            icon = Material.CHEST;
        }

        return Optional.of(new WorkspaceUpgrade(
                id,
                body.getString("display", id),
                icon,
                body.getStringList("description"),
                body.getString("requires-unlock", ""),
                steps));
    }

    private static TreeMap<Integer, Step> readSteps(
            ConfigurationSection levels,
            String id,
            Logger logger
    ) {
        TreeMap<Integer, Step> steps = new TreeMap<>();

        for (String key : levels.getKeys(false)) {
            ConfigurationSection body = levels.getConfigurationSection(key);

            if (body == null) {
                continue;
            }

            int level;

            try {
                level = Integer.parseInt(key.trim());
            } catch (NumberFormatException notANumber) {
                logger.warning("workspace.yml → upgrades → " + id + " → levels: \"" + key
                        + "\" is not a level number and was ignored.");
                continue;
            }

            if (level < 1) {
                logger.warning("workspace.yml → upgrades → " + id + " → levels: level " + level
                        + " is below 1 and was ignored.");
                continue;
            }

            steps.put(level, new Step(
                    level,
                    org.robtic.core.util.Robs.round(body.getDouble("cost", 0d)),
                    body.getInt("min-base-level", 1),
                    body.getDouble("value", 0d),
                    readRequires(body.getConfigurationSection("requires"))));
        }

        // A gap makes everything above it unreachable, because buying is one step at a time. Worth a
        // warning rather than a silent ceiling somebody discovers by paying for level 2 and finding
        // level 3 does not exist.
        int expected = 1;

        for (int level : steps.keySet()) {
            if (level != expected) {
                logger.warning("workspace.yml → upgrades → " + id + ": level " + expected
                        + " is missing, so nothing can be bought past level " + (expected - 1) + ".");
                break;
            }
            expected++;
        }

        return steps;
    }

    private static Map<String, Integer> readRequires(ConfigurationSection section) {
        if (section == null) {
            return Map.of();
        }

        Map<String, Integer> requires = new LinkedHashMap<>();

        for (String key : section.getKeys(false)) {
            requires.put(Ids.normalise(key), Math.max(1, section.getInt(key, 1)));
        }

        return requires;
    }
}
