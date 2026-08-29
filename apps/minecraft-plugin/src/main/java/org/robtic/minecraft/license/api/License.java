package org.robtic.minecraft.license.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.minecraft.util.Ids;
import org.robtic.minecraft.util.Robs;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * One kind of licence: an official Robtic document permitting an activity.
 *
 * <h2>A definition, not a possession</h2>
 *
 * This describes what a licence <em>is</em> — its name, what it costs to renew, how long a renewal
 * lasts, how you get one. It says nothing about any player. What a particular player holds is an
 * item, and the item carries its own issue and expiry dates; see {@link LicenseHolding}.
 *
 * That split is what lets two players hold the same licence with different expiry dates, and what
 * keeps the registry a description of the world rather than a record of everybody in it.
 *
 * <h2>Everything a future system needs is already here</h2>
 *
 * {@link #metadata} is the open end. A marketplace that wants a listing fee per licence, a dungeon
 * that wants a required floor, a reputation system that wants a standing — each puts its own value
 * under its own prefixed key rather than adding a field here that every other system has to ignore.
 *
 * @param id             unique, lowercase, usable as a placeholder argument and a permission fragment
 * @param categoryId     the category it belongs to; see {@link LicenseCategory}
 * @param display        shown to players; may contain legacy {@code &} codes
 * @param description    the lines under the name, on the item and in the browser
 * @param icon           material name for the item and the browser entry. Resolved by the item
 *                       factory, so a resource pack swap touches one class
 * @param modelData      custom model data, for a resource pack. Zero means none
 * @param rarity         a configured id rather than an enum — a server adding "Seasonal" should not
 *                       need a release
 * @param renewalCost    robs to renew. Zero means renewal is free, which is different from a licence
 *                       that cannot be renewed at all
 * @param renewalPeriod  how much time a renewal adds
 * @param initialPeriod  how long a freshly issued licence lasts. Zero means it never expires
 * @param renewable      whether the licence NPC will renew it
 * @param tradeable      whether it may be dropped or moved between players
 * @param consumable     whether using it destroys it
 * @param stackable      whether two of them stack. Almost always false — each carries its own dates
 * @param acquisition    how a player gets one, in the operator's own words. Never generated, because
 *                       the plugin cannot know what a server's dungeons drop
 * @param requirements   what a player needs before one is any use, in the operator's own words
 * @param statisticId    the statistic incremented when this licence is used. Blank for none
 * @param metadata       open-ended, for systems this module knows nothing about
 */
public record License(
        String id,
        String categoryId,
        String display,
        List<String> description,
        String icon,
        int modelData,
        String rarity,
        double renewalCost,
        Duration renewalPeriod,
        Duration initialPeriod,
        boolean renewable,
        boolean tradeable,
        boolean consumable,
        boolean stackable,
        List<String> acquisition,
        List<String> requirements,
        String statisticId,
        Map<String, String> metadata
) {

    public License {
        display = display == null || display.isBlank() ? id : display;
        description = List.copyOf(description);
        acquisition = List.copyOf(acquisition);
        requirements = List.copyOf(requirements);
        metadata = Map.copyOf(metadata);

        icon = icon == null || icon.isBlank() ? "PAPER" : icon;
        rarity = rarity == null || rarity.isBlank() ? "common" : rarity;
        statisticId = statisticId == null ? "" : statisticId;
        categoryId = categoryId == null || categoryId.isBlank() ? LicenseCategory.DEFAULT : categoryId;

        modelData = Math.max(0, modelData);

        // Never negative. A negative renewal cost would pay a player to renew, which is an exploit
        // rather than a discount, and the config it comes from is hand-edited.
        renewalCost = Robs.sanitise(renewalCost);

        renewalPeriod = renewalPeriod == null || renewalPeriod.isNegative() ? Duration.ZERO : renewalPeriod;
        initialPeriod = initialPeriod == null || initialPeriod.isNegative() ? Duration.ZERO : initialPeriod;

        // A licence that stacks cannot carry per-item dates: two stacked items are one stack with one
        // set of NBT, so renewing one would renew all of them and splitting the stack would clone the
        // expiry. Anything with an expiry is therefore forced unstackable rather than left to an
        // operator to get right.
        stackable = stackable && initialPeriod.isZero();
    }

    /** Whether this licence ever expires. */
    public boolean permanent() {
        return initialPeriod.isZero();
    }

    /** Whether renewing it is possible and would actually extend anything. */
    public boolean canRenew() {
        return renewable && !renewalPeriod.isZero();
    }

    /** A metadata value a future system attached. */
    public Optional<String> meta(String key) {
        return Optional.ofNullable(metadata.get(key.toLowerCase(Locale.ROOT)));
    }

    /**
     * When a licence issued now would expire.
     *
     * @return zero for a permanent licence, which is the value stored on the item and the one
     *         {@link LicenseHolding} reads as "never"
     */
    public long expiryFrom(long issuedAt) {
        return permanent() ? 0L : issuedAt + initialPeriod.toMillis();
    }

    /**
     * Reads one entry from {@code licenses.yml}.
     *
     * Forgiving in the same way every other parser in this plugin is: an unreadable duration or an
     * unknown category falls back with a warning rather than dropping the licence, because dropping
     * it would orphan every item players are already carrying. The one thing that is fatal is an
     * invalid id, which has no safe interpretation.
     */
    public static Optional<License> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);
        String where = "licenses.yml → licenses → " + key;

        if (!Ids.valid(id)) {
            logger.warning(where + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        if (body == null) {
            logger.warning(where + " is not a section and was ignored.");
            return Optional.empty();
        }

        Map<String, String> metadata = new LinkedHashMap<>();
        ConfigurationSection meta = body.getConfigurationSection("metadata");

        if (meta != null) {
            meta.getKeys(false).forEach(metaKey ->
                    metadata.put(metaKey.toLowerCase(Locale.ROOT), String.valueOf(meta.get(metaKey))));
        }

        return Optional.of(new License(
                id,
                Ids.normalise(body.getString("category", LicenseCategory.DEFAULT)),
                body.getString("display", id),
                body.getStringList("description"),
                body.getString("icon", "PAPER"),
                body.getInt("model-data", 0),
                Ids.normalise(body.getString("rarity", "common")),
                body.getDouble("renewal-cost", 0.0d),
                minutes(body, "renewal-minutes", where, logger),
                minutes(body, "duration-minutes", where, logger),
                body.getBoolean("renewable", true),
                body.getBoolean("tradeable", true),
                body.getBoolean("consumable", false),
                body.getBoolean("stackable", false),
                body.getStringList("how-to-obtain"),
                body.getStringList("requirements"),
                Ids.normalise(body.getString("statistic", "")),
                metadata));
    }

    /**
     * Reads a duration in minutes.
     *
     * Minutes rather than a parsed "7d 12h" string: the whole plugin configures durations this way,
     * and a second format would be one more thing for an operator to remember wrongly.
     */
    private static Duration minutes(ConfigurationSection body, String key, String where, Logger logger) {
        long value = body.getLong(key, 0L);

        if (value < 0L) {
            logger.warning(where + " → " + key + " is negative (" + value + "). Treating it as 0,"
                    + " which means \"never expires\" — set a positive number of minutes if that is"
                    + " not what you meant.");
            return Duration.ZERO;
        }

        return Duration.ofMinutes(value);
    }
}
