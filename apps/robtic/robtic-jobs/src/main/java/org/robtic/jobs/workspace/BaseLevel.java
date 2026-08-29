package org.robtic.jobs.workspace;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.unlock.UnlockCondition;
import org.robtic.core.unlock.UnlockConditions;
import org.robtic.core.unlock.UnlockContext;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * One rung of a business's headquarters.
 *
 * <h2>A base level unlocks systems; it is not a bigger building</h2>
 *
 * This is the distinction the whole design rests on. The level a business is at decides which NPC
 * roles stand outside it, how many workers it may employ, and — through {@link #unlocks} — which
 * other systems will serve it at all. The schematic is the visible consequence of that, not the
 * point of it.
 *
 * Keeping the two apart is also what lets workspace upgrades exist as a separate axis. Storage,
 * a mailbox, a tax office and a workshop are things a business buys; a base level is what it
 * becomes. Folding them together would mean a player who wanted more storage had to buy a
 * headquarters they did not need, which is exactly the progression this replaces.
 *
 * <h2>Unlimited levels, from configuration alone</h2>
 *
 * Levels are read as numeric keys and sorted. Eight ship; a fifteenth is a block of YAML and nothing
 * else. Nothing in this package names a level, counts them, or has an opinion about how many there
 * are — {@link WorkspaceSettings} walks whatever it was given.
 *
 * That extends to {@link #unlocks}. They are arbitrary strings, matched by whoever cares: the worker
 * system asks for {@code workers}, a future contracts module ships with {@code contracts} in level
 * 6's list and needs no change here. A level naming an unlock nobody implements is harmless, which
 * is what makes it safe to write the configuration ahead of the code.
 *
 * <h2>Cost is per level, not cumulative</h2>
 *
 * {@link #cost} is what it takes to reach this level from the one below, so rebalancing level 6 does
 * not silently change what levels 2 through 5 cost.
 *
 * @param level         1-based
 * @param display       shown in the upgrade menu
 * @param cost          Robs to reach this level from the previous one
 * @param schematic     the file pasted when a business reaches this level, or blank to leave the
 *                      building as it is. See {@code BuildingService}
 * @param npcRoles      which roles are staffed here; see {@link WorkspaceNpcRole}
 * @param unlocks       open-ended feature flags other systems gate on
 * @param npcWorkers    how many NPC workers may be employed at this level
 * @param playerWorkers how many players may be hired at this level
 * @param taxMultiplier scales the base tax, so a larger headquarters costs more to keep
 * @param requirements  conditions beyond the money, evaluated against the owner. Empty is the common
 *                      case and means the cost is the only gate
 */
public record BaseLevel(
        int level,
        String display,
        double cost,
        String schematic,
        Set<String> npcRoles,
        Set<String> unlocks,
        int npcWorkers,
        int playerWorkers,
        double taxMultiplier,
        List<UnlockCondition> requirements
) {

    public BaseLevel {
        level = Math.max(1, level);
        cost = org.robtic.core.util.Robs.sanitise(cost);
        schematic = schematic == null ? "" : schematic.trim();
        npcRoles = Set.copyOf(npcRoles);
        unlocks = Set.copyOf(unlocks);
        npcWorkers = Math.max(0, npcWorkers);
        playerWorkers = Math.max(0, playerWorkers);
        taxMultiplier = taxMultiplier <= 0 || Double.isNaN(taxMultiplier) ? 1.0d : taxMultiplier;
        requirements = List.copyOf(requirements);
    }

    /**
     * The level used when configuration is missing or a business's level is out of range.
     *
     * Deliberately functional rather than empty: a business whose level cannot be resolved should
     * still have a seller and be able to trade, because the alternative is somebody's livelihood
     * silently ceasing to work because of a config edit. It employs nobody, which is the safe
     * direction to fail in — an unresolvable level must not hand out staff.
     */
    public static final BaseLevel FALLBACK = new BaseLevel(
            1, "Workshop", 0d, "",
            Set.of(WorkspaceNpcRole.SELLER),
            Set.of(),
            0, 0,
            1.0d,
            List.of());

    public boolean staffs(String role) {
        return npcRoles.contains(role.toLowerCase(Locale.ROOT));
    }

    /** Whether this level unlocks a named system. */
    public boolean unlocks(String feature) {
        return unlocks.contains(feature.toLowerCase(Locale.ROOT));
    }

    public boolean hasSchematic() {
        return !schematic.isBlank();
    }

    /** The total worker headcount this level permits, of both kinds. */
    public int totalWorkers() {
        return npcWorkers + playerWorkers;
    }

    /**
     * Whether the owner satisfies everything but the money.
     *
     * Conditions are combined with AND, which is the only combination that makes sense as a default:
     * {@code any-of} and {@code not} are themselves conditions, so a level needing something looser
     * expresses it in YAML rather than needing a mode here.
     */
    public boolean requirementsMet(UnlockContext context) {
        for (UnlockCondition condition : requirements) {
            if (!condition.satisfied(context)) {
                return false;
            }
        }

        return true;
    }

    /** The first unmet requirement's description, for telling a player why they cannot upgrade. */
    public Optional<String> firstUnmet(UnlockContext context) {
        for (UnlockCondition condition : requirements) {
            if (!condition.satisfied(context)) {
                return Optional.of(condition.describe());
            }
        }

        return Optional.empty();
    }

    /**
     * Reads one level.
     *
     * @param conditions Core's condition registry. Null parses no requirements rather than failing,
     *                   because a level whose requirements could not be read should still be
     *                   reachable — refusing every upgrade is a far worse failure than ignoring a
     *                   gate the operator added
     */
    public static Optional<BaseLevel> parse(
            String key,
            ConfigurationSection body,
            UnlockConditions conditions,
            Logger logger
    ) {
        int level;

        try {
            level = Integer.parseInt(key.trim());
        } catch (NumberFormatException notANumber) {
            logger.warning("workspace.yml → base-levels: \"" + key + "\" is not a level number and"
                    + " was ignored.");
            return Optional.empty();
        }

        if (level < 1) {
            logger.warning("workspace.yml → base-levels: level " + level + " is below 1 and was ignored.");
            return Optional.empty();
        }

        ConfigurationSection workers = body.getConfigurationSection("workers");

        return Optional.of(new BaseLevel(
                level,
                body.getString("display", "Level " + level),
                org.robtic.core.util.Robs.round(body.getDouble("cost", 0d)),
                body.getString("schematic", ""),
                lowercase(body.getStringList("npcs")),
                lowercase(body.getStringList("unlocks")),
                workers == null ? 0 : workers.getInt("npc", 0),
                workers == null ? 0 : workers.getInt("player", 0),
                body.getDouble("tax-multiplier", 1.0d),
                readRequirements(body, conditions, level, logger)));
    }

    private static List<UnlockCondition> readRequirements(
            ConfigurationSection body,
            UnlockConditions conditions,
            int level,
            Logger logger
    ) {
        List<?> raw = body.getList("requirements");

        if (raw == null || raw.isEmpty()) {
            return List.of();
        }

        if (conditions == null) {
            logger.warning("workspace.yml → base-levels → " + level + " declares requirements, but"
                    + " Core's condition registry was not available when this file was read. They"
                    + " have been ignored, so the level is reachable by paying its cost alone.");
            return List.of();
        }

        return conditions.parse(raw, "workspace.yml → base-levels → " + level + " → requirements");
    }

    /** Normalised on the way in, so casing in the config is never load-bearing. */
    private static Set<String> lowercase(List<String> values) {
        Set<String> normalised = new LinkedHashSet<>();
        values.forEach(value -> normalised.add(value.trim().toLowerCase(Locale.ROOT)));
        return normalised;
    }
}
