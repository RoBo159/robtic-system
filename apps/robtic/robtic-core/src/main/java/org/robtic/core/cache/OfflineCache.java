package org.robtic.core.cache;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A cache that keeps serving after its entries go stale.
 *
 * An ordinary TTL cache treats "expired" and "absent" the same way, which is exactly wrong when
 * the reason it could not refresh is that the API is down — the choice then is not between fresh
 * and stale data, it is between stale data and nothing at all.
 *
 * So an entry has two ages. Inside {@code freshMillis} it is served without comment. Past that it
 * is still served, but marked stale so the caller can tell the player what they are looking at.
 * Past {@code maxAgeMillis} it is finally discarded, because data old enough to be actively
 * misleading is worse than an honest failure.
 *
 * @param <K> lookup key
 * @param <V> cached value
 */
public final class OfflineCache<K, V> {

    /** A cached value together with how much it should be trusted. */
    public record Entry<V>(V value, long storedAt, boolean stale) {

        /** How long ago this entry was refreshed from the API. */
        public long ageMillis() {
            return System.currentTimeMillis() - storedAt;
        }
    }

    private final Map<K, Entry<V>> entries = new ConcurrentHashMap<>();
    private final long freshMillis;
    private final long maxAgeMillis;

    public OfflineCache(long freshMillis, long maxAgeMillis) {
        this.freshMillis = freshMillis;
        this.maxAgeMillis = maxAgeMillis;
    }

    /** A value only if it is still fresh — the fast path for a caller that will refresh anyway. */
    public Optional<V> fresh(K key) {
        Entry<V> entry = entries.get(key);
        if (entry == null || entry.ageMillis() > freshMillis) {
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    /**
     * Any usable value, fresh or stale.
     *
     * The returned entry carries its own staleness, so the caller decides whether to warn rather
     * than this class guessing on their behalf.
     */
    public Optional<Entry<V>> any(K key) {
        Entry<V> entry = entries.get(key);

        if (entry == null) {
            return Optional.empty();
        }

        if (entry.ageMillis() > maxAgeMillis) {
            entries.remove(key);
            return Optional.empty();
        }

        return Optional.of(new Entry<>(entry.value(), entry.storedAt(), entry.ageMillis() > freshMillis));
    }

    public void put(K key, V value) {
        entries.put(key, new Entry<>(value, System.currentTimeMillis(), false));
    }

    public void invalidate(K key) {
        entries.remove(key);
    }

    public void clear() {
        entries.clear();
    }

    public int size() {
        return entries.size();
    }

    /** Every key currently held, so a reconnect can refresh them all. */
    public java.util.Set<K> keys() {
        return java.util.Set.copyOf(entries.keySet());
    }
}
