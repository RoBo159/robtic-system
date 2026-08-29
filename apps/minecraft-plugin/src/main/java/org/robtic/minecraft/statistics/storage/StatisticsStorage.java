package org.robtic.minecraft.statistics.storage;

import java.util.Map;
import java.util.UUID;

/**
 * Where statistics are persisted. Blocking; every method must be called off the main thread.
 *
 * <h2>Its own interface, not the progression one</h2>
 *
 * Statistics are core infrastructure and the brief is explicit that they must not depend on Jobs.
 * Sharing {@code ProgressionStorage} would have made every future plugin that wants to record a
 * number depend on the progression module's storage contract, its JSON shape and its API routes —
 * which is precisely the coupling this module exists to remove.
 *
 * The cost is one more small interface and one more file on disk. That is the correct price.
 *
 * <h2>Failure is an exception, not an empty record</h2>
 *
 * "This player has no statistics" and "we could not find out whether this player has statistics" must
 * not look the same to the caller, because saving the first over the second destroys real data. See
 * {@code StatisticsRepository}, which is the only class that has to get this right.
 */
public interface StatisticsStorage {

    /**
     * Reads one player's statistics.
     *
     * @return their stored values, or an empty record for a player who genuinely has none. Never null
     * @throws StorageException when the answer could not be determined
     */
    PlayerStatistics load(UUID playerId) throws StorageException;

    /** Writes one player's statistics, replacing whatever was there. */
    void save(UUID playerId, PlayerStatistics statistics) throws StorageException;

    /**
     * Writes several players' statistics.
     *
     * The default is a loop, which is right for a backend where each save is an independent request.
     * A backend whose saves contend on one file should override it — otherwise flushing every online
     * player is quadratic in how many are on.
     */
    default void saveAll(Map<UUID, PlayerStatistics> batch) throws StorageException {
        for (Map.Entry<UUID, PlayerStatistics> entry : batch.entrySet()) {
            save(entry.getKey(), entry.getValue());
        }
    }

    /** A short name for log lines, so an operator can see which backend is actually in use. */
    String describe();

    /** Signals a failure to reach or parse storage. Deliberately checked — callers must decide. */
    class StorageException extends Exception {
        public StorageException(String message) {
            super(message);
        }

        public StorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
