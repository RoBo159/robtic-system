package org.robtic.core.license.api;

import org.robtic.core.util.Ids;

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
 * Every licence and category the server knows about.
 *
 * <h2>The point of the module</h2>
 *
 * Nothing hard-codes a licence. A system that needs one registers a definition and then asks about
 * it by id; a system that wants to <em>display</em> licences iterates this registry and needs no
 * knowledge of what produced them. A future marketplace, dungeon or reputation module adds its
 * licences at enable and nothing in this package changes.
 *
 * <h2>Thread safety</h2>
 *
 * Registration happens on the main thread during enable, and — because plugins load in an order this
 * one does not control — potentially at any later point too. Reads happen from placeholder
 * resolution, from the GUI, and from inventory scans. Both maps are concurrent, and the category
 * index is derived on demand rather than cached, which removes the one thing that could disagree
 * with the authority.
 *
 * <h2>Unregistering does not invalidate items</h2>
 *
 * A plugin that unloads takes its definitions with it. The licence items players are carrying stay
 * exactly as they are, unreadable but intact, and work again the moment the plugin comes back.
 * Deleting them would make a plugin reload destroy player property.
 */
public final class LicenseRegistry {

    private final Logger logger;

    private final Map<String, License> licenses = new ConcurrentHashMap<>();
    private final Map<String, LicenseCategory> categories = new ConcurrentHashMap<>();

    /**
     * Told about every registration, so the service can announce it without this class knowing what
     * a Bukkit event is.
     */
    private volatile BiConsumer<License, Boolean> onRegistered = (license, replaced) -> {
    };

    public LicenseRegistry(Logger logger) {
        this.logger = logger;
    }

    /**
     * Sets the single subscriber told about every registration.
     *
     * Public because the service that owns this registry lives in the parent package, not because
     * anything else should call it — a second caller would replace the first.
     */
    public void onRegistered(BiConsumer<License, Boolean> listener) {
        this.onRegistered = listener == null ? (license, replaced) -> {
        } : listener;
    }

    // ─── Licences ─────────────────────────────────────────────────────────────────────────────

    /**
     * Adds a licence, replacing one already registered under the same id.
     *
     * <h2>Replacing is deliberate, and never touches an item</h2>
     *
     * The common cause of a re-registration is a reload or a plugin restarting, and keeping the
     * stale definition would mean an edited display name or a corrected renewal cost never took
     * effect until a restart.
     *
     * A definition change reinterprets the items players hold rather than invalidating them: the
     * item carries its id and its dates, and everything else — name, icon, cost — is read from
     * whatever is registered now. That is what makes a licence rebalanceable in place.
     *
     * @return whether it was accepted; only an invalid id is refused
     */
    public boolean register(License license) {
        if (license == null) {
            return false;
        }

        String id = Ids.normalise(license.id());

        if (!Ids.valid(id)) {
            logger.warning("Ignoring a licence with the id \"" + license.id() + "\": "
                    + Ids.describeProblem(id) + ".");
            return false;
        }

        boolean replaced = licenses.put(id, license) != null;
        onRegistered.accept(license, replaced);

        return true;
    }

    /** Registers several, returning how many were accepted. */
    public int registerAll(Collection<License> definitions) {
        int accepted = 0;

        for (License license : definitions) {
            if (register(license)) {
                accepted++;
            }
        }

        return accepted;
    }

    /** Removes a definition. Items players hold are untouched — see the class comment. */
    public boolean unregister(String id) {
        return licenses.remove(Ids.normalise(id)) != null;
    }

    public boolean exists(String id) {
        return licenses.containsKey(Ids.normalise(id));
    }

    public Optional<License> get(String id) {
        return Optional.ofNullable(licenses.get(Ids.normalise(id)));
    }

    /** Every licence, ordered by category then id, so a menu is stable between restarts. */
    public List<License> all() {
        List<License> ordered = new ArrayList<>(licenses.values());
        ordered.sort(ORDER);
        return List.copyOf(ordered);
    }

    /** Every licence in one category, in the same stable order. */
    public List<License> byCategory(String categoryId) {
        String id = Ids.normalise(categoryId);
        List<License> found = new ArrayList<>();

        for (License license : licenses.values()) {
            if (license.categoryId().equals(id)) {
                found.add(license);
            }
        }

        found.sort(ORDER);
        return List.copyOf(found);
    }

    public int size() {
        return licenses.size();
    }

    // ─── Categories ───────────────────────────────────────────────────────────────────────────

    public boolean register(LicenseCategory category) {
        if (category == null || !Ids.valid(Ids.normalise(category.id()))) {
            return false;
        }

        categories.put(Ids.normalise(category.id()), category);
        return true;
    }

    /**
     * The category with this id.
     *
     * Never empty. A licence naming a category nobody declared resolves to a placeholder, so no
     * caller has to decide what to do about a licence with no category.
     */
    public LicenseCategory category(String id) {
        String normalised = Ids.normalise(id);
        LicenseCategory found = categories.get(normalised);

        return found != null ? found : LicenseCategory.placeholder(normalised);
    }

    /** Every declared category, in display order. */
    public List<LicenseCategory> categories() {
        List<LicenseCategory> ordered = new ArrayList<>(categories.values());

        ordered.sort(Comparator.comparingInt(LicenseCategory::order)
                .thenComparing(LicenseCategory::id));

        return List.copyOf(ordered);
    }

    /** Category ids licences actually reference, including undeclared ones. */
    public Set<String> usedCategories() {
        Set<String> used = ConcurrentHashMap.newKeySet();
        licenses.values().forEach(license -> used.add(license.categoryId()));
        return Set.copyOf(used);
    }

    /**
     * Empties both registries.
     *
     * Used by a reload, which re-reads the config and re-registers everything. Definitions added
     * from code by other plugins are lost by this and must be replayed — see
     * {@code LicenseService#replayCodeRegistrations}.
     */
    public void clear() {
        licenses.clear();
        categories.clear();
    }

    /**
     * Category id, then licence id.
     *
     * The category's own order is not consulted: a licence knows only its category's id, and looking
     * the category up per comparison would make sorting a few hundred licences a few thousand map
     * reads. A caller wanting declared order iterates {@link #categories()} and calls
     * {@link #byCategory} for each, which is the access pattern the browser has anyway.
     */
    private static final Comparator<License> ORDER =
            Comparator.comparing(License::categoryId).thenComparing(License::id);
}
