package org.robtic.core.statistics.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.util.Ids;

import java.util.Optional;
import java.util.logging.Logger;

/**
 * A grouping of statistics, for menus, resets and reporting.
 *
 * <h2>Registered, not enumerated</h2>
 *
 * Player, Combat, Economy, World, Exploration, Workspace, NPC, Jobs, Market, Pets, Dungeons, Events —
 * and whatever the system after those wants. An enum would make each of them an edit to this file,
 * which is exactly the coupling the statistics module exists to avoid: a plugin registers its
 * category and its statistics at enable and nothing here changes.
 *
 * <h2>Unknown categories are created, not rejected</h2>
 *
 * A statistic naming a category nobody declared gets a placeholder category rather than being
 * dropped. Losing a statistic — and with it every value already recorded against it — because its
 * category section was not written is a far worse failure than a menu heading reading {@code dungeons}
 * instead of {@code Dungeons}. See {@link #placeholder}.
 *
 * @param id          stable identifier, lowercase
 * @param display     shown as a heading; may contain legacy {@code &} codes
 * @param description one line, for a menu tooltip
 * @param icon        material name for a future menu. Not resolved here — this module draws nothing,
 *                    and resolving it would make the registry depend on the server being started
 * @param order       sort position; lower first, ties broken by id so the order is stable
 */
public record StatisticCategory(
        String id,
        String display,
        String description,
        String icon,
        int order
) {

    /** The category a statistic falls into when it names none. */
    public static final String DEFAULT = "custom";

    public StatisticCategory {
        display = display == null || display.isBlank() ? id : display;
        description = description == null ? "" : description;
        icon = icon == null ? "" : icon;
    }

    /**
     * A stand-in for a category that was referenced but never declared.
     *
     * Ordered last, so an undeclared category sinks to the bottom of a menu rather than displacing
     * the ones somebody deliberately arranged.
     */
    public static StatisticCategory placeholder(String id) {
        return new StatisticCategory(id, id, "", "", Integer.MAX_VALUE);
    }

    public static Optional<StatisticCategory> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);

        if (!Ids.valid(id)) {
            logger.warning("statistics.yml → categories → " + key + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        return Optional.of(new StatisticCategory(
                id,
                body.getString("display", id),
                body.getString("description", ""),
                body.getString("icon", ""),
                body.getInt("order", 1_000)));
    }
}
