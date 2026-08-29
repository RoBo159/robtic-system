package org.robtic.minecraft.progression.storage;

import org.bukkit.plugin.Plugin;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.UnaryOperator;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The in-memory authority on progression while players are online, and the only thing that talks to
 * {@link ProgressionStorage}.
 *
 * <h2>The invariant that matters most</h2>
 *
 * <b>A player's progression is never saved unless it was first loaded successfully.</b>
 *
 * Everything else here is ordinary caching; this one rule is what stops an outage from becoming
 * permanent data loss. Without it the sequence is: storage is briefly unreachable, the player's load
 * fails, the cache serves EMPTY so the server keeps running, the player quits, the quit handler
 * saves EMPTY over three months of progress. Every step is individually reasonable, and the result
 * is unrecoverable.
 *
 * So an entry carries a {@code loaded} flag. Unloaded entries are readable — a player still gets in,
 * still sees an empty job list, and is told the system is degraded — but every write path checks the
 * flag and refuses. The cost is that progress made during an outage is lost; the alternative is that
 * progress made before it is lost, which is far worse.
 *
 * <h2>Writes are debounced, not immediate</h2>
 *
 * XP arrives many times a second while a player is mining. Saving on each would be thousands of
 * writes per player per session. Mutations mark the entry dirty and a periodic flush persists it,
 * with an immediate save forced at the points that actually matter — claiming a job, resigning,
 * quitting, shutdown.
 *
 * <h2>Threading</h2>
 *
 * {@link #get} and {@link #mutate} are main-thread, memory-only, and safe on the tick. Everything
 * touching {@link ProgressionStorage} runs on a worker. Callbacks are handed back on the main thread
 * so callers never have to think about which side of the boundary they are on.
 */
public final class ProgressionRepository {

    /**
     * One player's cached progression.
     *
     * @param progression the data as it currently stands
     * @param loaded      whether it came from storage. False means "we do not know", and blocks saves
     * @param dirty       whether it has changed since the last successful save
     */
    private record Entry(PlayerProgression progression, boolean loaded, boolean dirty) {

        Entry with(PlayerProgression next) {
            return new Entry(next, loaded, true);
        }

        Entry clean() {
            return new Entry(progression, loaded, false);
        }
    }

    private final Plugin plugin;
    private final ProgressionStorage storage;
    private final Logger logger;

    private final Map<UUID, Entry> entries = new ConcurrentHashMap<>();

    // Workspaces used to live here too. They now have their own repository, because they are
    // server-wide rather than per-player and are read on block events rather than on join — two
    // different lifetimes and two different access patterns sharing one class was the reason this
    // one had a load path that no player data ever used. See WorkspaceRepository.

    public ProgressionRepository(Plugin plugin, ProgressionStorage storage) {
        this.plugin = plugin;
        this.storage = storage;
        this.logger = plugin.getLogger();
    }

    public String backend() {
        return storage.describe();
    }

    // ─── Player data ──────────────────────────────────────────────────────────────────────────

    /**
     * Loads a player's progression on a worker and hands it back on the main thread.
     *
     * A failure caches an unloaded EMPTY entry rather than nothing at all, so the rest of the system
     * has something to read and does not need a null check on every path. That entry can never be
     * saved — see the class comment.
     */
    public void load(UUID playerId, Consumer<PlayerProgression> whenReady) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            Entry entry;

            try {
                entry = new Entry(storage.load(playerId), true, false);
            } catch (ProgressionStorage.StorageException failure) {
                logger.warning("Could not load progression for " + playerId + ": "
                        + failure.getMessage() + ". They will see an empty profile, and nothing "
                        + "will be saved for them until a load succeeds.");
                entry = new Entry(PlayerProgression.EMPTY, false, false);
            } catch (RuntimeException unexpected) {
                logger.log(Level.WARNING, "Unexpected failure loading progression for " + playerId, unexpected);
                entry = new Entry(PlayerProgression.EMPTY, false, false);
            }

            Entry stored = entry;
            entries.put(playerId, stored);

            plugin.getServer().getScheduler().runTask(plugin,
                    () -> whenReady.accept(stored.progression()));
        });
    }

    /**
     * The cached progression. Safe on the tick.
     *
     * Returns EMPTY for a player who is not cached at all rather than empty-Optional, because every
     * caller — placeholders, GUIs, listeners — would otherwise write the same fallback.
     */
    public PlayerProgression get(UUID playerId) {
        Entry entry = entries.get(playerId);
        return entry == null ? PlayerProgression.EMPTY : entry.progression();
    }

    /** Whether this player's data actually came from storage, so callers can degrade honestly. */
    public boolean isLoaded(UUID playerId) {
        Entry entry = entries.get(playerId);
        return entry != null && entry.loaded();
    }

    /**
     * Applies a change to a player's progression.
     *
     * @return the progression after the change — unchanged if the entry is not loaded, so a caller
     *         can compare and tell the player their action did not take effect
     */
    public PlayerProgression mutate(UUID playerId, UnaryOperator<PlayerProgression> change) {
        Entry entry = entries.get(playerId);

        if (entry == null || !entry.loaded()) {
            // Refused, quietly. The caller checks isLoaded and produces the message; warning here
            // would spam the console once per XP tick for a player whose load failed.
            return entry == null ? PlayerProgression.EMPTY : entry.progression();
        }

        PlayerProgression next = change.apply(entry.progression());

        if (next.equals(entry.progression())) {
            return next;
        }

        entries.put(playerId, entry.with(next));
        return next;
    }

    /**
     * Applies a change and persists it immediately rather than at the next flush.
     *
     * For the handful of events where losing the last few seconds would be visible and confusing:
     * claiming a job, resigning, equipping a title. Not for XP.
     */
    public PlayerProgression mutateAndSave(UUID playerId, UnaryOperator<PlayerProgression> change) {
        PlayerProgression next = mutate(playerId, change);
        save(playerId, false);
        return next;
    }

    /**
     * Persists one player if they are loaded and dirty.
     *
     * @param synchronously true only during shutdown, when the scheduler is gone and there is no
     *                      later chance to try again
     */
    public void save(UUID playerId, boolean synchronously) {
        Entry entry = entries.get(playerId);

        if (entry == null || !entry.loaded() || !entry.dirty()) {
            return;
        }

        // Marked clean before the write rather than after. A change made while the write is in
        // flight then re-dirties the entry and is saved by the next flush; doing it the other way
        // round would clear that flag and silently drop the newer change.
        entries.put(playerId, entry.clean());

        Runnable write = () -> {
            try {
                storage.save(playerId, entry.progression());
            } catch (ProgressionStorage.StorageException failure) {
                logger.warning("Could not save progression for " + playerId + ": " + failure.getMessage());
                // Re-dirtied so the next flush retries. Only if the player is still cached — a quit
                // save that fails has nowhere to put it back, and re-adding would leak the entry.
                entries.computeIfPresent(playerId, (id, current) -> current.with(current.progression()));
            } catch (RuntimeException unexpected) {
                logger.log(Level.WARNING, "Unexpected failure saving progression for " + playerId, unexpected);
            }
        };

        if (synchronously) {
            write.run();
        } else {
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, write);
        }
    }

    /** Persists every dirty entry. Called on a timer. */
    public void flush() {
        for (UUID playerId : List.copyOf(entries.keySet())) {
            save(playerId, false);
        }
    }

    /**
     * Saves and forgets a player who has left.
     *
     * The save is issued before the entry is dropped, and the entry is only dropped once the write
     * has been handed to the scheduler with its own copy of the data — so a disconnect during an
     * outage still queues the write rather than discarding it with the cache entry.
     */
    public void unload(UUID playerId) {
        save(playerId, false);
        entries.remove(playerId);
    }

    /**
     * Flushes everything synchronously. Shutdown only.
     *
     * The scheduler stops accepting async tasks during disable, so this deliberately blocks the
     * shutdown thread. A server taking an extra second to stop is the correct trade against losing
     * every online player's last session.
     */
    public void shutdown() {
        int pending = 0;

        for (Map.Entry<UUID, Entry> entry : entries.entrySet()) {
            if (entry.getValue().loaded() && entry.getValue().dirty()) {
                pending++;
                save(entry.getKey(), true);
            }
        }

        if (pending > 0) {
            logger.info("Saved progression for " + pending + " player(s) during shutdown.");
        }

        entries.clear();
    }
}
