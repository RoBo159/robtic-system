package org.robtic.minecraft.structure.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.minecraft.util.Ids;

import java.util.Locale;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * A grouping of marker types, used for the tabs in the marker menu.
 *
 * <h2>Registered, never hard-coded</h2>
 *
 * A future system adding markers of its own — mailboxes, quest givers, particle emitters — adds a
 * category from its config or from code, and the menu grows a tab. Nothing in this package
 * enumerates the possibilities.
 *
 * A marker type naming a category nobody declared still works: it resolves to a {@link #placeholder}
 * and sorts last. Losing a marker over a missing heading would be a much worse trade than an
 * unlabelled tab.
 *
 * @param id      lowercase, stable, referenced by marker types
 * @param display shown on the tab; {@code &} colour codes allowed
 * @param icon    material name for the tab item
 * @param order   ascending; ties broken by id so the menu never reorders itself between restarts
 */
public record MarkerCategory(String id, String display, String icon, int order) {

    /** Where a marker type lands when it names a category that was never declared. */
    public static final String DEFAULT = "general";

    public MarkerCategory {
        id = Ids.normalise(id);
    }

    public static MarkerCategory placeholder(String id) {
        String normalised = Ids.normalise(id);

        return new MarkerCategory(
                normalised,
                "&7" + capitalise(normalised),
                "PAPER",
                Integer.MAX_VALUE);
    }

    /**
     * Reads one category.
     *
     * @return empty when the id is unusable — the only failure that cannot be defaulted around,
     *         because an unaddressable category is a category no marker can reference
     */
    public static Optional<MarkerCategory> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);

        if (!Ids.valid(id)) {
            logger.warning("markers.yml → categories: ignoring \"" + key + "\": "
                    + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        if (body == null) {
            return Optional.of(placeholder(id));
        }

        return Optional.of(new MarkerCategory(
                id,
                body.getString("display", capitalise(id)),
                body.getString("icon", "PAPER"),
                body.getInt("order", 100)));
    }

    private static String capitalise(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        String spaced = value.replace('_', ' ');

        return spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
    }
}
