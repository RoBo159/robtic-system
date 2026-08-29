package org.robtic.core.statistics;

import org.bukkit.plugin.Plugin;
import org.robtic.core.statistics.storage.PlayerStatistics;
import org.robtic.core.statistics.storage.StatisticsStorage;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The in-memory authority on statistics while players are online, and the only thing that talks to
 * {@link StatisticsStorage}.
 *
 * <h2>The invariant that matters most</h2>
 *
 * <b>A player's statistics are never saved unless they were first loaded successfully.</b>
 *
 * Everything else here is caching; this one rule is what stops an outage from becoming permanent data
 * loss. Without it the sequence is: storage is briefly unreachable, the player's load fails, the
 * cache serves an empty record so the server keeps running, the player mines for an hour, the quit
 * handler saves that hour over three years of totals. Every step is individually reasonable and the
 * result is unrecoverable.
 *
 * So an entry carries a {@code loaded} flag. Unloaded entries are readable and writable in memory —
 * a player still gets in and still sees their session's numbers — but the save path checks the flag
 * and refuses. Progress made during an outage is lost; progress made before it is not.
 *
 * <h2>Writes are debounced, and they have to be</h2>
 *
 * A statistic is written many times a second while a player is active. Saving on each would be
 * thousands of writes per player per session, and is the single fastest way to make this the slowest
 * system on the server. Mutations mark the record dirty — a volatile boolean set, nothing more — and
 * a periodic flush persists the ones that changed, with a save forced at the points that matter:
 * quit, and shutdown.
 *
 * <h2>Threading</h2>
 *
 * {@link #get} is safe from any thread and allocates nothing; {@link PlayerStatistics} is internally
 * concurrent, so a statistic recorded from an async task is not a data race. Everything touching
 * {@link StatisticsStorage} runs on a worker, and callbacks are handed back on the main thread so
 * callers never have to think about which side of the boundary they are on.
 */
public final class StatisticsRepository {

    /**
     * One player's cached statistics.
     *
     * The values themselves are mutable and thread-safe, so unlike the progression equivalent this
     * entry is not replaced on every change — only the {@code loaded} flag is immutable state, and
     * dirtiness lives inside {@link PlayerStatistics} next to the data it describes.
     */
    private record Entry(PlayerStatistics statistics, boolean loaded) {
    }

    private final Plugin plugin;
    private final StatisticsStorage storage;
    private final Logger logger;

    private final Map<UUID, Entry> entries = new ConcurrentHashMap<>();

    public StatisticsRepository(Plugin plugin, StatisticsStorage storage) {
        this.plugin = plugin;
        this.storage = storage;
        this.logger = plugin.getLogger();
    }

    public String backend() {
        return storage.describe();
    }

    // ─── Loading ──────────────────────────────────────────────────────────────────────────────

    /**
     * Loads a player's statistics on a worker and hands them back on the main thread.
     *
     * A failure caches an unloaded empty record rather than nothing at all, so every read path has
     * something to return and none of them needs a null check. That record can never be saved — see
     * the class comment.
     */
    public void load(UUID playerId, Consumer<PlayerStatistics> whenReady) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            Entry entry;

            try {
                entry = new Entry(storage.load(playerId), true);
            } catch (StatisticsStorage.StorageException failure) {
                logger.warning("Could not load statistics for " + playerId + ": " + failure.getMessage()
                        + ". They will show as having none, and nothing will be saved for them until "
                        + "a load succeeds.");
                entry = new Entry(PlayerStatistics.empty(), false);
            } catch (RuntimeException unexpected) {
                logger.log(Level.WARNING, "Unexpected failure loading statistics for " + playerId, unexpected);
                entry = new Entry(PlayerStatistics.empty(), false);
            }

            Entry loaded = entry;
            entries.put(playerId, loaded);

            plugin.getServer().getScheduler().runTask(plugin,
                    () -> whenReady.accept(loaded.statistics()));
        });
    }

    /**
     * The cached statistics, or empty when this player is not tracked.
     *
     * <h2>There is deliberately no inserting variant</h2>
     *
     * An earlier version had one, and every read went through it. A placeholder resolved for an
     * offline player — which a leaderboard or a web panel does constantly, for accounts that will
     * never log in — created a cache entry that nothing ever removed, and the map grew for as long as
     * the server ran.
     *
     * Entries are created by {@link #load} and by nothing else. A write for a player who has none is
     * dropped rather than cached; see {@code StatisticsService} for why an increment made before the
     * stored total is known has no correct resolution once that total arrives.
     */
    public Optional<PlayerStatistics> peek(UUID playerId) {
        Entry entry = entries.get(playerId);
        return entry == null ? Optional.empty() : Optional.of(entry.statistics());
    }

    /** Whether this player's data actually came from storage, so callers can degrade honestly. */
    public boolean isLoaded(UUID playerId) {
        Entry entry = entries.get(playerId);
        return entry != null && entry.loaded();
    }

    /** Whether this player is cached at all. */
    public boolean isTracked(UUID playerId) {
        return entries.containsKey(playerId);
    }

    /** Every player currently held. */
    public List<UUID> tracked() {
        return List.copyOf(entries.keySet());
    }

    // ─── Saving ───────────────────────────────────────────────────────────────────────────────

    /**
     * Persists one player if they are loaded and something changed.
     *
     * @param synchronously true only during shutdown, when the scheduler is gone and there is no
     *                      later chance to try again
     */
    public void save(UUID playerId, boolean synchronously) {
        Entry entry = entries.get(playerId);

        if (entry == null || !entry.loaded()) {
            return;
        }

        // Read-and-clear, before the snapshot below. A change made while the write is in flight
        // re-dirties the record and is caught by the next flush; clearing the flag after the write
        // would discard exactly that change.
        if (!entry.statistics().takeDirty()) {
            return;
        }

        PlayerStatistics data = entry.statistics();

        Runnable write = () -> {
            try {
                storage.save(playerId, data);
            } catch (StatisticsStorage.StorageException failure) {
                logger.warning("Could not save statistics for " + playerId + ": " + failure.getMessage());
                // Re-dirtied so the next flush retries.
                data.markDirty();
            } catch (RuntimeException unexpected) {
                logger.log(Level.WARNING, "Unexpected failure saving statistics for " + playerId, unexpected);
                data.markDirty();
            }
        };

        if (synchronously) {
            write.run();
        } else {
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, write);
        }
    }

    /**
     * Persists every dirty record. Called on a timer.
     *
     * Collected into one batch and handed to the storage in a single call, so a backend that can
     * write several at once does. The dirty flags are taken on the calling thread, before the worker
     * starts, for the same reason as in {@link #save}.
     */
    public void flush() {
        Map<UUID, PlayerStatistics> batch = new LinkedHashMap<>();

        for (Map.Entry<UUID, Entry> entry : entries.entrySet()) {
            if (entry.getValue().loaded() && entry.getValue().statistics().takeDirty()) {
                batch.put(entry.getKey(), entry.getValue().statistics());
            }
        }

        if (batch.isEmpty()) {
            return;
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                storage.saveAll(batch);
            } catch (StatisticsStorage.StorageException failure) {
                logger.warning("Could not flush statistics for " + batch.size() + " player(s): "
                        + failure.getMessage());
                batch.values().forEach(PlayerStatistics::markDirty);
            } catch (RuntimeException unexpected) {
                logger.log(Level.WARNING, "Unexpected failure flushing statistics", unexpected);
                batch.values().forEach(PlayerStatistics::markDirty);
            }
        });
    }

    /**
     * Saves and forgets a player who has left.
     *
     * The save is issued before the entry is dropped, and the worker holds its own reference to the
     * data — so a disconnect during an outage still queues the write rather than discarding it along
     * with the cache entry.
     */
    public void unload(UUID playerId) {
        save(playerId, false);
        entries.remove(playerId);
    }

    /**
     * Flushes everything synchronously. Shutdown only.
     *
     * The scheduler stops accepting async tasks during disable, so this deliberately blocks the
     * shutdown thread. A server taking an extra moment to stop is the correct trade against losing
     * every online player's session.
     */
    public void shutdown() {
        Map<UUID, PlayerStatistics> batch = new LinkedHashMap<>();

        for (Map.Entry<UUID, Entry> entry : entries.entrySet()) {
            if (entry.getValue().loaded() && entry.getValue().statistics().takeDirty()) {
                batch.put(entry.getKey(), entry.getValue().statistics());
            }
        }

        if (!batch.isEmpty()) {
            try {
                storage.saveAll(batch);
                logger.info("Saved statistics for " + batch.size() + " player(s) during shutdown.");
            } catch (StatisticsStorage.StorageException failure) {
                logger.warning("Could not save statistics for " + batch.size()
                        + " player(s) during shutdown: " + failure.getMessage());
            } catch (RuntimeException unexpected) {
                logger.log(Level.SEVERE, "Unexpected failure saving statistics during shutdown", unexpected);
            }
        }

        entries.clear();
    }
}
