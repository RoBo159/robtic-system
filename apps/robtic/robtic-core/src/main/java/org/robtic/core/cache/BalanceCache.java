package org.robtic.core.cache;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.robtic.core.util.Robs;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Coin balances held locally so the economy keeps working during an API outage.
 *
 * Two numbers per player, deliberately kept apart:
 *
 * <ul>
 *   <li><b>synced</b> — the last balance the API confirmed. Only the API ever writes this.</li>
 *   <li><b>pending</b> — robs earned since then whose credit is still sitting in the offline
 *       queue. The plugin owns this one.</li>
 * </ul>
 *
 * The player is shown {@code synced + pending}, so ore sold during an outage visibly pays out
 * immediately even though the API has not seen it yet. When the queue drains, the API returns a
 * balance that already includes those credits — at which point the pending figure is cleared
 * rather than added again, which is what stops the reconnect double-counting.
 *
 * The file is written on shutdown so a restart mid-outage does not lose a pending credit.
 *
 * <h2>Decimal outside, exact integers inside</h2>
 *
 * Robs carry two decimal places, so every figure here is a {@code double} at the boundary. The
 * atomics behind them are not: they hold <em>hundredths as a long</em>. A balance is built by
 * repeated increments from several threads, and a compare-and-set that accumulates doubles both
 * drifts — {@code double} cannot represent {@code 0.1} — and needs a CAS loop, where an integer
 * needs one lock-free add. The conversion happens at this class's edge and nowhere else; see
 * {@link Robs#toMinor}.
 */
public final class BalanceCache {

    /** What the player is shown, and how much of it the API has actually confirmed. */
    public record Balance(double synced, double pending, long syncedAt, boolean stale) {

        /** The figure to display: confirmed plus not-yet-delivered earnings. */
        public double total() {
            return Robs.add(synced, pending);
        }

        public boolean hasPending() {
            return !Robs.isZero(pending);
        }
    }

    private final Map<UUID, AtomicLong> synced = new ConcurrentHashMap<>();
    private final Map<UUID, AtomicLong> pending = new ConcurrentHashMap<>();
    private final Map<UUID, Long> syncedAt = new ConcurrentHashMap<>();

    /** Key stating that this file's values are hundredths rather than whole robs. See {@link #load}. */
    private static final String UNIT_MARKER = "$hundredths";

    private final Path storageFile;
    private final Logger logger;
    private final long maxAgeMillis;

    public BalanceCache(Path storageFile, Logger logger, long maxAgeMillis) {
        this.storageFile = storageFile;
        this.logger = logger;
        this.maxAgeMillis = maxAgeMillis;
    }

    /** Records a balance the API confirmed. Clears nothing — see {@link #reconcile}. */
    public void putSynced(UUID uuid, double balance) {
        synced.computeIfAbsent(uuid, key -> new AtomicLong()).set(Robs.toMinor(balance));
        syncedAt.put(uuid, System.currentTimeMillis());
    }

    /**
     * Records robs earned while the API was unreachable.
     *
     * Called at the moment the items leave the player's inventory, so what they see reflects the
     * sale they just made rather than the last time the network happened to be up.
     */
    public void addPending(UUID uuid, double amount) {
        long minor = Robs.toMinor(amount);

        if (minor == 0L) {
            return;
        }

        pending.computeIfAbsent(uuid, key -> new AtomicLong()).addAndGet(minor);
    }

    /**
     * Accepts an authoritative balance after the queue has drained.
     *
     * The pending figure is dropped, not subtracted: the returned balance already contains those
     * credits because the queued requests are what produced it. Subtracting here would remove them
     * a second time.
     */
    public void reconcile(UUID uuid, double authoritativeBalance) {
        synced.computeIfAbsent(uuid, key -> new AtomicLong()).set(Robs.toMinor(authoritativeBalance));
        syncedAt.put(uuid, System.currentTimeMillis());
        pending.remove(uuid);
    }

    /** The cached balance, or empty when nothing usable is held for this player. */
    public Optional<Balance> get(UUID uuid) {
        AtomicLong syncedValue = synced.get(uuid);
        if (syncedValue == null) {
            return Optional.empty();
        }

        long storedAt = syncedAt.getOrDefault(uuid, 0L);
        long age = System.currentTimeMillis() - storedAt;

        // Past the age limit the number is discarded rather than shown. A balance old enough to be
        // actively wrong is worse than telling the player the economy is unavailable.
        if (age > maxAgeMillis && Robs.isZero(pendingOf(uuid))) {
            return Optional.empty();
        }

        return Optional.of(new Balance(
                Robs.fromMinor(syncedValue.get()),
                pendingOf(uuid),
                storedAt,
                age > maxAgeMillis / 4
        ));
    }

    public double pendingOf(UUID uuid) {
        AtomicLong value = pending.get(uuid);
        return value == null ? 0d : Robs.fromMinor(value.get());
    }

    /** Players carrying an undelivered credit, which a reconnect must reconcile. */
    public java.util.Set<UUID> playersWithPending() {
        return java.util.Set.copyOf(pending.keySet());
    }

    public void forget(UUID uuid) {
        // The pending figure is kept on purpose: a player who logs out with a queued credit must
        // still have it reconciled, and dropping it here would lose the record of what is owed.
        synced.remove(uuid);
        syncedAt.remove(uuid);
    }

    /** Persists pending credits so a restart during an outage does not lose what is owed. */
    public void save() {
        if (pending.isEmpty()) {
            deleteQuietly();
            return;
        }

        JsonObject root = new JsonObject();

        // Marks the values as hundredths. A file written before robs became decimal holds whole
        // robs under the same keys, and reading one of those as hundredths would divide every
        // undelivered credit on the server by a hundred — see load().
        root.addProperty(UNIT_MARKER, true);

        // Written in hundredths, the same exact integer the atomic holds. Writing the decimal would
        // put a value through a text round trip that cannot represent it, and a credit that comes
        // back a hundredth lighter than it went out is the one thing this file exists to prevent.
        for (Map.Entry<UUID, AtomicLong> entry : pending.entrySet()) {
            if (entry.getValue().get() != 0) {
                root.addProperty(entry.getKey().toString(), entry.getValue().get());
            }
        }

        try {
            Files.createDirectories(storageFile.getParent());
            Files.writeString(storageFile, root.toString(), StandardCharsets.UTF_8);
            logger.info("Persisted " + (root.size() - 1) + " pending coin credit(s) for reconciliation on next start.");
        } catch (IOException error) {
            logger.log(Level.WARNING, "Could not persist pending coin credits", error);
        }
    }

    public void load() {
        if (!Files.exists(storageFile)) {
            return;
        }

        try {
            JsonObject root = JsonParser.parseString(Files.readString(storageFile, StandardCharsets.UTF_8))
                    .getAsJsonObject();

            // Absent in a file written before robs became decimal, whose values are whole robs.
            boolean hundredths = root.has(UNIT_MARKER) && root.get(UNIT_MARKER).getAsBoolean();

            for (String key : root.keySet()) {
                if (UNIT_MARKER.equals(key)) {
                    continue;
                }

                long stored = root.get(key).getAsLong();

                pending.put(UUID.fromString(key),
                        new AtomicLong(hundredths ? stored : stored * 100L));
            }

            if (!pending.isEmpty()) {
                logger.info("Restored " + pending.size() + " pending coin credit(s) from the previous run.");
            }
        } catch (IOException | RuntimeException error) {
            logger.log(Level.WARNING, "Could not read pending coin credits — discarding them", error);
            pending.clear();
        }

        deleteQuietly();
    }

    private void deleteQuietly() {
        try {
            Files.deleteIfExists(storageFile);
        } catch (IOException error) {
            logger.log(Level.FINE, "Could not remove the balance cache file", error);
        }
    }
}
