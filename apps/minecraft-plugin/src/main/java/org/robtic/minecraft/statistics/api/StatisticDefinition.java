package org.robtic.minecraft.statistics.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.minecraft.util.Ids;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * Everything known about one statistic, other than any player's value for it.
 *
 * <h2>Metadata so a menu needs no code</h2>
 *
 * The display name, description, icon and ordering live here rather than in whatever GUI eventually
 * lists them. That is the difference between a badges menu being a config file and a badges menu
 * being a release: a system that wants to show statistics reads these definitions and renders them,
 * and a statistic registered by a plugin that did not exist when the menu was written appears in it
 * anyway.
 *
 * {@link #metadata} is the open end of that. Anything a future system wants to attach to a statistic
 * — a colour, a badge threshold, a leaderboard flag — goes in there under its own prefixed key,
 * rather than becoming a field here that every other system has to ignore.
 *
 * <h2>Defaults are stored as a long, like the value</h2>
 *
 * For the reason given in {@link StatisticType}: numeric statistics share one representation all the
 * way down. A double default is its bit pattern, a boolean default is 0 or 1.
 *
 * @param id           unique, lowercase, usable as a placeholder argument and a permission fragment
 * @param categoryId   the category it belongs to; see {@link StatisticCategory}
 * @param display      shown to players
 * @param description  one line explaining what it counts
 * @param type         how the stored value is interpreted
 * @param defaultValue the value a player who has never recorded one is treated as having
 * @param defaultText  the same, for a {@link StatisticType.Kind#TEXT} statistic
 * @param hidden       whether a generic menu should list it. Hidden statistics still record and
 *                     still resolve through the API and placeholders — this is about presentation,
 *                     not access
 * @param persistent   whether it survives a restart. False for a statistic that is only meaningful
 *                     within a session, which then costs nothing to store
 * @param resetPolicy  when it returns to {@link #defaultValue}
 * @param metadata     open-ended, for systems this module knows nothing about
 */
public record StatisticDefinition(
        String id,
        String categoryId,
        String display,
        String description,
        StatisticType type,
        long defaultValue,
        String defaultText,
        boolean hidden,
        boolean persistent,
        ResetPolicy resetPolicy,
        Map<String, String> metadata
) {

    public StatisticDefinition {
        display = display == null || display.isBlank() ? id : display;
        description = description == null ? "" : description;
        defaultText = defaultText == null ? "" : defaultText;
        categoryId = categoryId == null || categoryId.isBlank() ? StatisticCategory.DEFAULT : categoryId;
        resetPolicy = resetPolicy == null ? ResetPolicy.NEVER : resetPolicy;
        metadata = Map.copyOf(metadata);

        // A SESSION statistic is by definition not persisted. Stating both would let a record say
        // two contradictory things, and every reader would have to decide which one wins.
        persistent = persistent && resetPolicy != ResetPolicy.SESSION;
    }

    /** The simplest useful definition: a lifetime counter in a category. */
    public static StatisticDefinition counter(String id, String categoryId, String display) {
        return new StatisticDefinition(id, categoryId, display, "", StatisticTypes.LONG,
                0L, "", false, true, ResetPolicy.NEVER, Map.of());
    }

    /** Whether accumulating into this statistic is meaningful. Delegates to the type. */
    public boolean accumulable() {
        return type.accumulable();
    }

    public boolean textual() {
        return type.kind() == StatisticType.Kind.TEXT;
    }

    /** A metadata value a future system attached. */
    public Optional<String> meta(String key) {
        return Optional.ofNullable(metadata.get(key));
    }

    /** This player's value rendered for display, through the type. */
    public String format(long raw) {
        return type.format(raw);
    }

    public String format(String raw) {
        return type.format(raw);
    }

    /**
     * Reads one entry from {@code statistics.yml}.
     *
     * Forgiving in the same way every other parser in this plugin is: an unknown type or reset policy
     * falls back with a warning rather than dropping the statistic, because dropping it would orphan
     * every value already recorded against it. The two things that <em>are</em> fatal are an invalid
     * id and a missing body, neither of which has a safe interpretation.
     */
    public static Optional<StatisticDefinition> parse(
            String key,
            ConfigurationSection body,
            Logger logger
    ) {
        String id = Ids.normalise(key);
        String where = "statistics.yml → statistics → " + key;

        if (!Ids.valid(id)) {
            logger.warning(where + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        if (body == null) {
            logger.warning(where + " is not a section and was ignored.");
            return Optional.empty();
        }

        String typeId = body.getString("type", StatisticTypes.LONG.id());
        StatisticType type = StatisticTypes.find(typeId).orElse(null);

        if (type == null) {
            logger.warning(where + ": unknown type \"" + typeId + "\". Using \"long\". Known types are "
                    + StatisticTypes.all().stream().map(StatisticType::id).sorted().toList() + ".");
            type = StatisticTypes.LONG;
        }

        ResetPolicy declared = ResetPolicy.parse(body.getString("reset"), null);

        if (declared == null && body.isString("reset")) {
            logger.warning(where + ": unknown reset policy \"" + body.getString("reset")
                    + "\". Using NEVER.");
        }

        Map<String, String> metadata = new LinkedHashMap<>();
        ConfigurationSection meta = body.getConfigurationSection("metadata");

        if (meta != null) {
            meta.getKeys(false).forEach(metaKey ->
                    metadata.put(metaKey.toLowerCase(java.util.Locale.ROOT), String.valueOf(meta.get(metaKey))));
        }

        return Optional.of(new StatisticDefinition(
                id,
                Ids.normalise(body.getString("category", StatisticCategory.DEFAULT)),
                body.getString("display", id),
                body.getString("description", ""),
                type,
                defaultValue(body, type),
                body.getString("default", ""),
                body.getBoolean("hidden", false),
                body.getBoolean("persistent", true),
                declared == null ? ResetPolicy.NEVER : declared,
                metadata));
    }

    /** Reads {@code default} in whichever shape the type stores. */
    private static long defaultValue(ConfigurationSection body, StatisticType type) {
        if (type.kind() == StatisticType.Kind.TEXT) {
            return 0L;
        }

        if (type == StatisticTypes.DOUBLE) {
            return StatisticTypes.encodeDouble(body.getDouble("default", 0.0d));
        }

        if (type == StatisticTypes.BOOLEAN) {
            return StatisticTypes.encodeBoolean(body.getBoolean("default", false));
        }

        return body.getLong("default", 0L);
    }
}
