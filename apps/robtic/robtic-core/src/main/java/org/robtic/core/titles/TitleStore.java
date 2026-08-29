package org.robtic.core.titles;

import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Where a player's titles are kept.
 *
 * <h2>Why titles needed their own store</h2>
 *
 * In the monolith, titles and professions shared one record — {@code PlayerProgression(titles,
 * jobs)} — written to one file per player. That was right when both lived in the same plugin and is
 * wrong now: titles are Core infrastructure that must work on a server with no RobticJobs installed,
 * and Core cannot depend on a feature plugin for storage.
 *
 * So this is the narrow port titles need and nothing more: four operations, no knowledge of
 * professions, and no knowledge of whether the data lives in a file or behind the API.
 *
 * <h2>The split is a migration, not a break</h2>
 *
 * {@link org.robtic.core.titles.FileTitleStore} reads the monolith's combined record when it finds
 * no title file of its own and extracts the titles from it. Nobody edits anything, and a server
 * upgrading from 3.x keeps every title every player earned. See that class for the details.
 */
public interface TitleStore {

    /**
     * Whether this player's titles are in memory.
     *
     * Every write checks this first. Writing for a player whose data has not arrived would either
     * invent an empty record and overwrite what they own, or block the main thread waiting for I/O —
     * and the first of those loses titles silently.
     */
    boolean isLoaded(UUID player);

    /**
     * What a player owns and wears.
     *
     * Never null. An unloaded or unknown player reads as {@link PlayerTitles#EMPTY}, so callers that
     * are only displaying something do not need a branch — but anything that writes must still check
     * {@link #isLoaded}, because empty-because-absent and empty-because-new are the same value here
     * and very different facts.
     */
    PlayerTitles titles(UUID player);

    /**
     * Changes a player's titles and persists the result.
     *
     * Takes a function rather than a value so the read and the write cannot be separated by another
     * thread's write. A caller that read, modified and stored would lose a title granted between its
     * read and its store — rare, and impossible to reproduce when it is reported.
     *
     * Does nothing when the player is not loaded.
     */
    void mutate(UUID player, UnaryOperator<PlayerTitles> change);

    /** Brings a player's titles into memory, off the main thread. */
    void load(UUID player);

    /** Releases a player's titles, flushing anything unwritten. */
    void unload(UUID player);
}
