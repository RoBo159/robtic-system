package org.robtic.minecraft.cache;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * A per-player cache with a fixed TTL and explicit invalidation.
 *
 * <h2>Why the plugin is cache-first</h2>
 *
 * The API is the source of truth, but it is across a network. A command that asked it every time
 * would put a round trip in front of `/home`, `/back` and every particle tick — and would fail
 * outright during an outage. So each feature loads its state once, keeps it here, and invalidates
 * the moment it is the thing that changed it.
 *
 * That is the important half: most entries here have no TTL at all ({@link CachePolicy#FOREVER}).
 * A home list cannot go stale behind the plugin's back, because `/sethome` is what changes it and
 * `/sethome` is what clears this. Only the values Discord owns — premium, the profile — need a
 * clock, because those genuinely can change without the game server being told.
 *
 * @param <V> cached value
 */
public final class PlayerCache<V> {

    private record Entry<V>(V value, long storedAt) {
        boolean olderThan(long millis) {
            return millis != CachePolicy.FOREVER && System.currentTimeMillis() - storedAt > millis;
        }
    }

    private final Map<UUID, Entry<V>> entries = new ConcurrentHashMap<>();
    private final String name;
    private final long ttlMillis;

    public PlayerCache(String name, long ttlMillis) {
        this.name = name;
        this.ttlMillis = ttlMillis;
    }

    public String name() {
        return name;
    }

    /** The cached value if it is still within its TTL. */
    public Optional<V> get(UUID uuid) {
        Entry<V> entry = entries.get(uuid);

        if (entry == null) {
            return Optional.empty();
        }

        if (entry.olderThan(ttlMillis)) {
            entries.remove(uuid);
            return Optional.empty();
        }

        return Optional.of(entry.value());
    }

    /**
     * A value even if its TTL has lapsed, provided it is not older than the hard limit.
     *
     * The fallback for an unreachable API: a thirty-one-minute-old premium tier is a far better
     * answer than telling a paying player they are not premium.
     */
    public Optional<V> stale(UUID uuid) {
        Entry<V> entry = entries.get(uuid);

        if (entry == null || entry.olderThan(CachePolicy.MAX_AGE_MILLIS)) {
            entries.remove(uuid);
            return Optional.empty();
        }

        return Optional.of(entry.value());
    }

    /**
     * The cached value, or the supplier's result stored and returned.
     *
     * The supplier performs network I/O, so this must not run on the server tick.
     */
    public V getOrLoad(UUID uuid, Supplier<V> loader) {
        Optional<V> cached = get(uuid);
        if (cached.isPresent()) {
            return cached.get();
        }

        V loaded = loader.get();
        if (loaded != null) {
            put(uuid, loaded);
        }
        return loaded;
    }

    public void put(UUID uuid, V value) {
        entries.put(uuid, new Entry<>(value, System.currentTimeMillis()));
    }

    /** Replaces the cached value in place, for a mutation whose response is the new state. */
    public void replace(UUID uuid, V value) {
        put(uuid, value);
    }

    public void invalidate(UUID uuid) {
        entries.remove(uuid);
    }

    public void clear() {
        entries.clear();
    }

    public int size() {
        return entries.size();
    }

    public Set<UUID> keys() {
        return Set.copyOf(entries.keySet());
    }
}
