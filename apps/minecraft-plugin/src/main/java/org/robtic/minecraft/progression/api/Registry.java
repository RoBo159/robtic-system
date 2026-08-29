package org.robtic.minecraft.progression.api;

import org.robtic.minecraft.util.Ids;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * An ordered, id-keyed collection of one kind of configured thing.
 *
 * Every registry in the progression system is one of these: titles, jobs, rarities, title sources,
 * unlock condition types, NPC definitions. They are wildly different types with one shared problem —
 * an operator writes them in YAML, so any of them can arrive duplicated, misnamed or empty.
 *
 * <h2>Rejection is loud, and it is not fatal</h2>
 *
 * A bad entry is refused and named in the console; the rest of the file still loads. The alternative
 * — aborting the load — turns one typo in one title into a server with no progression system at all,
 * which is a far worse outcome than one missing title. The alternative in the other direction —
 * accepting it silently — is how duplicate ids become a support ticket that starts "some players
 * have the wrong title and I don't know why".
 *
 * <h2>Insertion order is preserved</h2>
 *
 * A {@link LinkedHashMap}, so `all()` hands back what the operator wrote in the order they wrote it.
 * GUIs sort explicitly by priority or rarity, but anything that does not sort should still be stable
 * between restarts rather than reordering itself with the hash seed.
 *
 * @param <T> what this registry holds
 */
public class Registry<T extends Identified> {

    private final String what;
    private final Logger logger;
    private final Map<String, T> byId = new LinkedHashMap<>();

    /**
     * @param what   singular, lowercase, used in log lines: "title", "job", "rarity"
     * @param logger the plugin logger; every rejection is reported through it
     */
    public Registry(String what, Logger logger) {
        this.what = what;
        this.logger = logger;
    }

    /**
     * Adds an entry, refusing invalid and duplicate ids.
     *
     * @return whether it was accepted, so a caller building a batch can count the failures
     */
    public boolean register(T value) {
        if (value == null) {
            return false;
        }

        String id = value.id();

        if (!Ids.valid(id)) {
            logger.warning("Ignoring a " + what + " with the id \"" + id + "\": "
                    + Ids.describeProblem(id) + ".");
            return false;
        }

        T existing = byId.putIfAbsent(id, value);

        if (existing != null) {
            // Named rather than counted. "2 duplicate titles" tells an operator there is a problem;
            // the id tells them where it is.
            logger.warning("Ignoring a second " + what + " with the id \"" + id
                    + "\" — ids must be unique, and the first one defined is the one that is used.");
            return false;
        }

        return true;
    }

    /** The entry with this id, matched case-insensitively. */
    public Optional<T> find(String id) {
        return Optional.ofNullable(byId.get(Ids.normalise(id)));
    }

    /** Whether anything is registered under this id. */
    public boolean has(String id) {
        return byId.containsKey(Ids.normalise(id));
    }

    /** Every entry, in the order it was defined. */
    public Collection<T> all() {
        return List.copyOf(byId.values());
    }

    /** Every registered id, in definition order. */
    public Collection<String> ids() {
        return List.copyOf(byId.keySet());
    }

    public int size() {
        return byId.size();
    }

    public boolean isEmpty() {
        return byId.isEmpty();
    }

    /**
     * Empties the registry ahead of a reload.
     *
     * Registries are rebuilt wholesale rather than diffed, because a diff would have to decide what
     * to do about a title that vanished from the config while a player was wearing it — and the
     * answer to that lives in the title service, which can see player data, not here.
     */
    public void clear() {
        byId.clear();
    }
}
