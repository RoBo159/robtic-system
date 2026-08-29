package org.robtic.minecraft.structure.api;

import org.robtic.minecraft.util.Ids;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;
import java.util.logging.Logger;

/**
 * Every marker type and category the server knows about.
 *
 * <h2>The extension point</h2>
 *
 * The stated goal for this system is that a future structure — a dungeon, a guild hall, an event
 * arena — needs new marker types and no new architecture. This registry is how: a module registers
 * its types at enable, the marker menu grows entries for them, the scanner reads them out of
 * generated buildings, and the validator checks them. None of that code ever learns what a dungeon
 * is.
 *
 * <h2>Unregistering does not invalidate placed markers</h2>
 *
 * A plugin that unloads takes its types with it. Marker blocks already standing in a schematic keep
 * their persistent data untouched and become readable again the moment the plugin returns. A scan
 * that meets an unregistered type reports it as unknown and moves on, rather than deleting it —
 * destroying a builder's work because a plugin was temporarily disabled would be indefensible.
 *
 * <h2>Thread safety</h2>
 *
 * Registration is main-thread, at enable and potentially later as other plugins load. Reads come
 * from the menu, the scanner and the validator. Both maps are concurrent and the category index is
 * derived on demand, so there is no cached view that can disagree with the authority.
 */
public final class MarkerRegistry {

    private final Logger logger;

    private final Map<String, MarkerType> types = new ConcurrentHashMap<>();
    private final Map<String, MarkerCategory> categories = new ConcurrentHashMap<>();

    /** Told about every registration, so the owning system can announce it without this class knowing about events. */
    private volatile BiConsumer<MarkerType, Boolean> onRegistered = (type, replaced) -> {
    };

    public MarkerRegistry(Logger logger) {
        this.logger = logger;
    }

    /**
     * Sets the single subscriber told about every registration.
     *
     * Public because the system that owns this registry lives in the parent package, not because
     * anything else should call it — a second caller would silently replace the first.
     */
    public void onRegistered(BiConsumer<MarkerType, Boolean> listener) {
        this.onRegistered = listener == null ? (type, replaced) -> {
        } : listener;
    }

    // ─── Types ────────────────────────────────────────────────────────────────────────────────

    /**
     * Adds a marker type, replacing one already registered under the same id.
     *
     * Replacing is deliberate. The common cause of a re-registration is a reload, and keeping the
     * stale definition would mean an edited display name or a corrected NPC role never took effect
     * until a restart. Markers already placed in the world are reinterpreted by the new definition
     * rather than invalidated: the block carries an id, and everything else is read from whatever is
     * registered now.
     *
     * @return whether it was accepted; only an unusable id is refused
     */
    public boolean register(MarkerType type) {
        if (type == null) {
            return false;
        }

        String id = Ids.normalise(type.id());

        if (!Ids.valid(id)) {
            logger.warning("Ignoring a marker type with the id \"" + type.id() + "\": "
                    + Ids.describeProblem(id) + ".");
            return false;
        }

        boolean replaced = types.put(id, type) != null;
        onRegistered.accept(type, replaced);

        return true;
    }

    /** Registers several, returning how many were accepted. */
    public int registerAll(Collection<MarkerType> definitions) {
        int accepted = 0;

        for (MarkerType type : definitions) {
            if (register(type)) {
                accepted++;
            }
        }

        return accepted;
    }

    /** Removes a definition. Markers already placed are untouched — see the class comment. */
    public boolean unregister(String id) {
        return types.remove(Ids.normalise(id)) != null;
    }

    public boolean exists(String id) {
        return types.containsKey(Ids.normalise(id));
    }

    public Optional<MarkerType> get(String id) {
        return Optional.ofNullable(types.get(Ids.normalise(id)));
    }

    /** Every type, ordered by category then id, so the menu is stable between restarts. */
    public List<MarkerType> all() {
        List<MarkerType> ordered = new ArrayList<>(types.values());
        ordered.sort(ORDER);
        return List.copyOf(ordered);
    }

    /** Every type in one category, in the same stable order. */
    public List<MarkerType> byCategory(String categoryId) {
        String id = Ids.normalise(categoryId);
        List<MarkerType> found = new ArrayList<>();

        for (MarkerType type : types.values()) {
            if (type.categoryId().equals(id)) {
                found.add(type);
            }
        }

        found.sort(ORDER);
        return List.copyOf(found);
    }

    /**
     * Every type that defines a corner of the region.
     *
     * Used by the validator and by {@link MarkerSet} so neither has to know which ids those are.
     */
    public List<MarkerType> corners(MarkerType.Bounds bounds) {
        List<MarkerType> found = new ArrayList<>();

        for (MarkerType type : types.values()) {
            if (type.bounds() == bounds) {
                found.add(type);
            }
        }

        found.sort(ORDER);
        return List.copyOf(found);
    }

    /** Every type that must be present for a structure to be valid. */
    public List<MarkerType> requiredTypes() {
        List<MarkerType> found = new ArrayList<>();

        for (MarkerType type : types.values()) {
            if (type.required() || type.cardinality().mandatory()) {
                found.add(type);
            }
        }

        found.sort(ORDER);
        return List.copyOf(found);
    }

    public int size() {
        return types.size();
    }

    // ─── Categories ───────────────────────────────────────────────────────────────────────────

    public boolean register(MarkerCategory category) {
        if (category == null || !Ids.valid(Ids.normalise(category.id()))) {
            return false;
        }

        categories.put(Ids.normalise(category.id()), category);
        return true;
    }

    /**
     * The category with this id.
     *
     * Never empty. A type naming an undeclared category resolves to a placeholder, so no caller has
     * to decide what to do about a type with no category.
     */
    public MarkerCategory category(String id) {
        String normalised = Ids.normalise(id);
        MarkerCategory found = categories.get(normalised);

        return found != null ? found : MarkerCategory.placeholder(normalised);
    }

    /** Every declared category, in display order. */
    public List<MarkerCategory> categories() {
        List<MarkerCategory> ordered = new ArrayList<>(categories.values());

        ordered.sort(Comparator.comparingInt(MarkerCategory::order).thenComparing(MarkerCategory::id));

        return List.copyOf(ordered);
    }

    /** Category ids that types actually reference, including undeclared ones. */
    public Set<String> usedCategories() {
        Set<String> used = ConcurrentHashMap.newKeySet();
        types.values().forEach(type -> used.add(type.categoryId()));
        return Set.copyOf(used);
    }

    /**
     * Empties both registries.
     *
     * Used by a reload, which re-reads the config and re-registers everything. Types added from code
     * by other modules are lost by this and must be replayed — see
     * {@code StructureMarkerSystem#replayCodeRegistrations}.
     */
    public void clear() {
        types.clear();
        categories.clear();
    }

    /**
     * Category id, then type id.
     *
     * The category's declared order is not consulted here: a type knows only its category's id, and
     * looking the category up per comparison would turn one sort into thousands of map reads. A
     * caller wanting declared order iterates {@link #categories()} and calls {@link #byCategory} for
     * each, which is the access pattern the menu has anyway.
     */
    private static final Comparator<MarkerType> ORDER =
            Comparator.comparing(MarkerType::categoryId).thenComparing(MarkerType::id);
}
