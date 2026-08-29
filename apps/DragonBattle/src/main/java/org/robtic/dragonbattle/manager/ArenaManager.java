package org.robtic.dragonbattle.manager;

import org.robtic.dragonbattle.config.PluginSettings;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.storage.ArenaStorage;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Owns the set of configured arenas, and the file they live in.
 *
 * <h2>An instance, not a static holder</h2>
 *
 * Constructed once by the plugin and injected into everything that needs it. That is what lets the
 * command layer be exercised against a manager holding fixtures rather than whatever the running
 * server happens to have loaded, and it means a reload replaces one object instead of mutating
 * global state other code may be halfway through reading.
 *
 * <h2>Names are case-insensitive</h2>
 *
 * An operator who created `Arena1` and later types `arena1` means the same arena. Keys are stored
 * lowercased and the display name is kept on the arena itself.
 */
public final class ArenaManager {

    private final ArenaStorage storage;
    private final PluginSettings settings;

    private final Map<String, Arena> arenas = new LinkedHashMap<>();

    public ArenaManager(ArenaStorage storage, PluginSettings settings) {
        this.storage = storage;
        this.settings = settings;
    }

    /** Reads every arena from disk, replacing what is held. */
    public void load() {
        arenas.clear();
        storage.load(settings.arenaDefaults()).forEach((name, arena) -> arenas.put(key(name), arena));
    }

    public void save() {
        storage.save(arenas);
    }

    public Collection<Arena> all() {
        return java.util.List.copyOf(arenas.values());
    }

    public Optional<Arena> get(String name) {
        return Optional.ofNullable(arenas.get(key(name)));
    }

    public boolean exists(String name) {
        return arenas.containsKey(key(name));
    }

    /**
     * Creates an arena and persists it immediately.
     *
     * Saved on creation rather than on first edit, so an operator who creates one and then has the
     * server crash does not lose the fact that they created it.
     *
     * @return the new arena, or empty when the name is taken
     */
    public Optional<Arena> create(String name) {
        if (exists(name)) {
            return Optional.empty();
        }

        Arena arena = new Arena(name, settings.arenaDefaults());
        arenas.put(key(name), arena);
        save();

        return Optional.of(arena);
    }

    public boolean delete(String name) {
        if (arenas.remove(key(name)) == null) {
            return false;
        }

        save();
        return true;
    }

    private static String key(String name) {
        return name.toLowerCase(Locale.ROOT);
    }
}
