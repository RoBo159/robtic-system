package org.robtic.minecraft.statistics.api;

import org.robtic.minecraft.util.Ids;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Every statistic and category the server knows about.
 *
 * <h2>The point of the whole module</h2>
 *
 * Nothing hard-codes a statistic. A system that wants to count something registers a definition and
 * then reads and writes it by id; a system that wants to <em>display</em> statistics iterates this
 * registry and needs no knowledge of what produced them. That is what makes one source of truth
 * possible: there is no second place a counter could live, because there is no code that names one.
 *
 * <h2>Thread safety</h2>
 *
 * Registration happens on the main thread during enable, and — because plugins load in an order this
 * one does not control — potentially at any later point too. Reads happen from placeholder
 * resolution, from worker threads decoding player records, and from the reset sweep. So both maps are
 * concurrent and the category index is derived on demand rather than cached, which removes the one
 * thing that could disagree with the authority.
 *
 * <h2>Unregistering</h2>
 *
 * Supported, and deliberately does not touch stored values. A plugin that unloads takes its
 * definitions with it; the numbers it recorded stay in every player's record, unreadable but intact,
 * and come back the moment the plugin does. Deleting them would make a plugin reload destructive.
 */
public final class StatisticRegistry {

    private final Logger logger;

    private final Map<String, StatisticDefinition> statistics = new ConcurrentHashMap<>();
    private final Map<String, StatisticCategory> categories = new ConcurrentHashMap<>();

    /**
     * Told about every registration, so the service can announce it without this class knowing what
     * a Bukkit event is.
     *
     * A consumer rather than a listener list: there is exactly one subscriber — the service that owns
     * this registry — and a general-purpose observer mechanism for one caller is machinery nobody
     * asked for.
     */
    private volatile java.util.function.BiConsumer<StatisticDefinition, Boolean> onRegistered =
            (definition, replaced) -> {
            };

    public StatisticRegistry(Logger logger) {
        this.logger = logger;
    }

    /**
     * Sets the single subscriber told about every registration.
     *
     * Public because the service that owns this registry lives in the parent package, not because
     * anything else should call it — a second caller would replace the first and the service would
     * stop announcing registrations. Systems that want to know about new statistics listen for
     * {@code StatisticRegisteredEvent}, which is what this feeds.
     */
    public void onRegistered(java.util.function.BiConsumer<StatisticDefinition, Boolean> listener) {
        this.onRegistered = listener == null ? (definition, replaced) -> {
        } : listener;
    }

    // ─── Statistics ───────────────────────────────────────────────────────────────────────────

    /**
     * Adds a statistic.
     *
     * <h2>Re-registering is allowed and is not a no-op</h2>
     *
     * Unlike the progression registries, which keep the first definition and warn, this replaces.
     * The reasons differ: there, two titles with one id means an operator made a mistake and the
     * safe answer is to change nothing. Here, the common cause is a plugin reloading or a config
     * being re-read, and keeping the stale definition would mean an edited display name or a
     * corrected type never took effect until a restart.
     *
     * Replacing a definition never touches a stored value. A type change therefore reinterprets
     * existing numbers rather than discarding them, which is the behaviour that makes a mistyped
     * {@code type: long} correctable in place.
     *
     * @return whether it was accepted; only an invalid id is refused
     */
    public boolean register(StatisticDefinition definition) {
        if (definition == null) {
            return false;
        }

        String id = Ids.normalise(definition.id());

        if (!Ids.valid(id)) {
            logger.warning("Ignoring a statistic with the id \"" + definition.id() + "\": "
                    + Ids.describeProblem(id) + ".");
            return false;
        }

        // Whether it replaced an existing definition is decided here, where the map itself says so.
        // Inferring it anywhere else — from whether the caller was code or config, say — answers a
        // different question and gets it wrong for exactly the case a listener cares about.
        boolean replaced = statistics.put(id, definition) != null;

        onRegistered.accept(definition, replaced);

        return true;
    }

    /** Registers several, returning how many were accepted. */
    public int registerAll(Collection<StatisticDefinition> definitions) {
        int accepted = 0;

        for (StatisticDefinition definition : definitions) {
            if (register(definition)) {
                accepted++;
            }
        }

        return accepted;
    }

    /**
     * Removes a statistic's definition. Stored player values are left alone — see the class comment.
     *
     * @return whether anything was registered under that id
     */
    public boolean unregister(String id) {
        return statistics.remove(Ids.normalise(id)) != null;
    }

    public boolean exists(String id) {
        return statistics.containsKey(Ids.normalise(id));
    }

    public Optional<StatisticDefinition> get(String id) {
        return Optional.ofNullable(statistics.get(Ids.normalise(id)));
    }

    /** Every definition, ordered by category and then by id, so a menu is stable between restarts. */
    public List<StatisticDefinition> all() {
        List<StatisticDefinition> ordered = new ArrayList<>(statistics.values());
        ordered.sort(ORDER);
        return List.copyOf(ordered);
    }

    /** Every definition in one category, in the same stable order. */
    public List<StatisticDefinition> byCategory(String categoryId) {
        String id = Ids.normalise(categoryId);

        List<StatisticDefinition> found = new ArrayList<>();

        for (StatisticDefinition definition : statistics.values()) {
            if (definition.categoryId().equals(id)) {
                found.add(definition);
            }
        }

        found.sort(ORDER);
        return List.copyOf(found);
    }

    /** Definitions whose values are written to storage. The set the codec cares about. */
    public List<StatisticDefinition> persistent() {
        return all().stream().filter(StatisticDefinition::persistent).toList();
    }

    /** Definitions under a periodic or session reset policy. The set the reset sweep cares about. */
    public List<StatisticDefinition> resettable() {
        return all().stream()
                .filter(definition -> definition.resetPolicy() != ResetPolicy.NEVER)
                .toList();
    }

    public int size() {
        return statistics.size();
    }

    // ─── Categories ───────────────────────────────────────────────────────────────────────────

    public boolean register(StatisticCategory category) {
        if (category == null || !Ids.valid(Ids.normalise(category.id()))) {
            return false;
        }

        categories.put(Ids.normalise(category.id()), category);
        return true;
    }

    /**
     * The category with this id.
     *
     * Never empty. A statistic naming a category nobody declared resolves to a placeholder rather
     * than to nothing, so no caller has to decide what to do about a statistic with no category —
     * see {@link StatisticCategory#placeholder}.
     */
    public StatisticCategory category(String id) {
        String normalised = Ids.normalise(id);
        StatisticCategory found = categories.get(normalised);

        return found != null ? found : StatisticCategory.placeholder(normalised);
    }

    public boolean categoryExists(String id) {
        return categories.containsKey(Ids.normalise(id));
    }

    /** Every declared category, in display order. */
    public List<StatisticCategory> categories() {
        List<StatisticCategory> ordered = new ArrayList<>(categories.values());

        ordered.sort(Comparator.comparingInt(StatisticCategory::order)
                .thenComparing(StatisticCategory::id));

        return List.copyOf(ordered);
    }

    /** Category ids that statistics actually reference, including undeclared ones. */
    public Set<String> usedCategories() {
        Set<String> used = ConcurrentHashMap.newKeySet();
        statistics.values().forEach(definition -> used.add(definition.categoryId()));
        return Set.copyOf(used);
    }

    /**
     * Empties both registries.
     *
     * Used by a reload, which re-reads the config and re-registers everything. Definitions added from
     * code by other plugins are lost by this and must be re-registered — which is why the service
     * keeps its own record of code-registered definitions and replays them. See
     * {@code StatisticsService#reload}.
     */
    public void clear() {
        statistics.clear();
        categories.clear();
    }

    /**
     * Category order first, then id.
     *
     * The category's own order is not consulted here: a definition only knows its category's id, and
     * looking the category up per comparison would make sorting a few hundred definitions a few
     * thousand map reads. Callers that want categories in declared order iterate
     * {@link #categories()} and call {@link #byCategory} for each, which is the access pattern a menu
     * has anyway.
     */
    private static final Comparator<StatisticDefinition> ORDER =
            Comparator.comparing(StatisticDefinition::categoryId)
                    .thenComparing(StatisticDefinition::id);
}
