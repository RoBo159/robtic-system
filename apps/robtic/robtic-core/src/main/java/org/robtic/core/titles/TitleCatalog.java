package org.robtic.core.titles;

import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.util.Colors;
import org.robtic.core.util.Ids;
import org.robtic.core.registry.Rarity;
import org.robtic.core.registry.Registry;
import org.robtic.core.titles.TitleSource;
import org.robtic.core.unlock.UnlockCondition;
import org.robtic.core.unlock.UnlockConditions;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * Reads {@code titles.yml} into the three registries the title system runs on.
 *
 * Rarities and sources are parsed before titles because a title resolves both by id, and a title
 * naming one that has not been read yet would fall back to UNKNOWN for no reason other than file
 * ordering.
 *
 * <h2>Registered titles, and dynamic ones</h2>
 *
 * Not every title in the system comes from this file. The job system generates its milestone titles
 * from {@code jobs.yml} — a server adding a job gets its five titles without writing them twice —
 * and hands them here through {@link #contribute}. From the title system's point of view a
 * contributed title is indistinguishable from a configured one, which is what stops "job title" from
 * becoming a special case that every GUI and command has to handle.
 */
public final class TitleCatalog {

    private final Logger logger;
    private final UnlockConditions conditions;

    private final Registry<Rarity> rarities;
    private final Registry<TitleSource> sources;
    private final Registry<Title> titles;

    public TitleCatalog(Logger logger, UnlockConditions conditions) {
        this.logger = logger;
        this.conditions = conditions;
        this.rarities = new Registry<>("rarity", logger);
        this.sources = new Registry<>("title source", logger);
        this.titles = new Registry<>("title", logger);
    }

    public Registry<Title> titles() {
        return titles;
    }

    public Registry<Rarity> rarities() {
        return rarities;
    }

    public Registry<TitleSource> sources() {
        return sources;
    }

    public Optional<Title> title(String id) {
        return titles.find(id);
    }

    /** Rarity by id, falling back to {@link Rarity#UNKNOWN} rather than empty. */
    public Rarity rarity(String id) {
        return rarities.find(id).orElse(Rarity.UNKNOWN);
    }

    public TitleSource source(String id) {
        return sources.find(id).orElse(TitleSource.UNKNOWN);
    }

    /**
     * Rebuilds every registry from a freshly parsed file.
     *
     * Wholesale rather than incremental. What to do about a player wearing a title that has just been
     * deleted is a question about player data, and it is answered in {@link TitleService} where the
     * player data actually is.
     */
    public void load(ConfigurationSection root) {
        rarities.clear();
        sources.clear();
        titles.clear();

        if (root == null) {
            logger.warning("titles.yml is empty or unreadable — no titles were loaded.");
            return;
        }

        loadRarities(root.getConfigurationSection("rarities"));
        loadSources(root.getConfigurationSection("sources"));
        loadTitles(root.getConfigurationSection("titles"));

        logger.info("Loaded " + titles.size() + " title(s), " + rarities.size()
                + " rarit(ies) and " + sources.size() + " source(s).");
    }

    /**
     * Adds a title built elsewhere, e.g. a job milestone.
     *
     * Goes through the same {@link Registry} as configured titles, so a job whose milestone id
     * collides with a hand-written title is reported instead of silently shadowing it.
     */
    public boolean contribute(Title title) {
        return titles.register(title);
    }

    // ─── Parsing ──────────────────────────────────────────────────────────────────────────────

    private void loadRarities(ConfigurationSection section) {
        if (section == null) {
            logger.warning("titles.yml has no \"rarities\" section — every title will render as Unknown.");
            return;
        }

        for (String key : section.getKeys(false)) {
            Rarity.parse(key, section.getConfigurationSection(key)).ifPresent(rarities::register);
        }
    }

    private void loadSources(ConfigurationSection section) {
        if (section == null) {
            logger.warning("titles.yml has no \"sources\" section — titles cannot be filtered by source.");
            return;
        }

        for (String key : section.getKeys(false)) {
            TitleSource.parse(key, section.getConfigurationSection(key)).ifPresent(sources::register);
        }
    }

    private void loadTitles(ConfigurationSection section) {
        if (section == null) {
            logger.warning("titles.yml has no \"titles\" section.");
            return;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body == null) {
                logger.warning("titles.yml → " + key + " is not a section and was ignored.");
                continue;
            }

            parse(key, body, "titles.yml → " + key).ifPresent(titles::register);
        }
    }

    /**
     * Parses one title body. Public so the job system builds its milestones through exactly the same
     * code path, rather than a parallel constructor that could drift from this one.
     */
    public Optional<Title> parse(String id, ConfigurationSection body, String where) {
        String normalised = Ids.normalise(id);

        if (!Ids.valid(normalised)) {
            logger.warning(where + ": " + Ids.describeProblem(normalised) + ".");
            return Optional.empty();
        }

        String rarityId = body.getString("rarity", "common");
        Rarity rarity = rarities.find(rarityId).orElseGet(() -> {
            logger.warning(where + ": unknown rarity \"" + rarityId + "\", falling back to Unknown.");
            return Rarity.UNKNOWN;
        });

        String sourceId = body.getString("source", "custom");
        TitleSource source = sources.find(sourceId).orElseGet(() -> {
            logger.warning(where + ": unknown source \"" + sourceId + "\", falling back to Unknown.");
            return TitleSource.UNKNOWN;
        });

        // The rarity's colour is the default, so a server that recolours "Legendary" recolours every
        // legendary title at once instead of editing each one.
        TextColor color = Colors.parse(body.getString("color", ""))
                .orElse(rarity.color() == null ? NamedTextColor.WHITE : rarity.color());

        Material icon = Optional.ofNullable(Material.matchMaterial(body.getString("icon", "NAME_TAG")))
                .orElseGet(() -> {
                    logger.warning(where + ": unknown icon material \""
                            + body.getString("icon") + "\", using NAME_TAG.");
                    return Material.NAME_TAG;
                });

        List<UnlockCondition> parsed = conditions.parse(body.getList("unlock"), where);

        String permission = body.getString("permission", "");

        return Optional.of(new Title(
                normalised,
                body.getString("display", normalised),
                color,
                rarity,
                icon,
                description(body),
                body.getInt("priority", 0),
                permission.isBlank() ? Optional.empty() : Optional.of(permission),
                source,
                body.getBoolean("hidden", false),
                UnlockConditions.allOf(parsed),
                metadata(body.getConfigurationSection("metadata"))
        ));
    }

    /** Accepts either a single string or a list, because both read naturally in YAML. */
    private static List<String> description(ConfigurationSection body) {
        if (body.isList("description")) {
            return List.copyOf(body.getStringList("description"));
        }

        String single = body.getString("description", "");
        return single.isBlank() ? List.of() : List.of(single);
    }

    private static Map<String, String> metadata(ConfigurationSection section) {
        if (section == null) {
            return Map.of();
        }

        Map<String, String> values = new LinkedHashMap<>();

        for (String key : section.getKeys(false)) {
            Object value = section.get(key);
            if (value != null) {
                values.put(key, String.valueOf(value));
            }
        }

        return values;
    }

    // ─── Views ────────────────────────────────────────────────────────────────────────────────

    /**
     * Every title, sorted the way the GUI lists them: priority first, then rarity, then name.
     *
     * Computed here rather than in the menu so the command output, the profile page and the menu all
     * agree on an order — three places sorting "the same way" independently is three chances to
     * drift.
     */
    public List<Title> sorted() {
        List<Title> all = new ArrayList<>(titles.all());

        all.sort(Comparator
                .comparingInt(Title::priority).reversed()
                .thenComparing((Title title) -> title.rarity().order()).reversed()
                .thenComparing(Title::display, String.CASE_INSENSITIVE_ORDER));

        return all;
    }

    /** Titles from one source, in the same order. Backs the GUI's source filter. */
    public List<Title> from(String sourceId) {
        String normalised = Ids.normalise(sourceId);

        return sorted().stream()
                .filter(title -> title.source().id().equals(normalised))
                .toList();
    }
}
