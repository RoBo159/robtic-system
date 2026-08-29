package org.robtic.core.license.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.util.Ids;

import java.util.Optional;
import java.util.logging.Logger;

/**
 * A grouping of licences, for the browser and for reporting.
 *
 * <h2>Registered, not enumerated</h2>
 *
 * Profession, Marketplace, Merchant, Premium, Special, Event — and whatever the system after those
 * wants. An enum would make each of them an edit to this file, which is exactly the coupling the
 * licence module exists to avoid: a future plugin registers its category and its licences at enable
 * and nothing here changes.
 *
 * <h2>An unknown category is created, not rejected</h2>
 *
 * A licence naming a category nobody declared gets a placeholder rather than being dropped. Losing a
 * licence — and with it every item players are already carrying — because its category section was
 * not written is a far worse failure than a browser heading reading {@code dungeon} instead of
 * {@code Dungeon}.
 *
 * @param id      stable identifier, lowercase
 * @param display shown as a heading; may contain legacy {@code &} codes
 * @param icon    material name for the browser's category tab. Resolved by the GUI, not here — this
 *                module draws nothing, and resolving it would make the registry depend on a running
 *                server
 * @param order   sort position; lower first, ties broken by id so the order is stable
 */
public record LicenseCategory(String id, String display, String icon, int order) {

    /** The category a licence falls into when it names none. */
    public static final String DEFAULT = "custom";

    public LicenseCategory {
        display = display == null || display.isBlank() ? id : display;
        icon = icon == null ? "" : icon;
    }

    /**
     * A stand-in for a category that was referenced but never declared.
     *
     * Ordered last, so an undeclared category sinks to the bottom of the browser rather than
     * displacing the ones somebody deliberately arranged.
     */
    public static LicenseCategory placeholder(String id) {
        return new LicenseCategory(id, id, "", Integer.MAX_VALUE);
    }

    public static Optional<LicenseCategory> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);

        if (!Ids.valid(id)) {
            logger.warning("licenses.yml → categories → " + key + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        return Optional.of(new LicenseCategory(
                id,
                body.getString("display", id),
                body.getString("icon", ""),
                body.getInt("order", 1_000)));
    }
}
