package org.robtic.core.entitlement;

import java.util.UUID;

/**
 * Whoever knows what a player is currently entitled to.
 *
 * <h2>The seam that keeps Premium and Essentials apart</h2>
 *
 * {@link Entitlements} come from the API and are cached by whichever plugin already talks to the
 * player-data endpoints — today RobticEssentials, whose survival cache fetches them on join along
 * with homes and friends.
 *
 * RobticPremium needs the same values to decide which LuckPerms group a player should hold. Reaching
 * into Essentials for them would make a premium plugin depend on a homes-and-friends plugin, which
 * is backwards and is exactly the feature-to-feature coupling the split exists to remove.
 *
 * So the holder registers this, and the reader resolves it. Both depend on Core and neither knows
 * the other exists. If nothing registers a source — a server with no Essentials — Premium finds
 * none, logs one line, and its group sync does nothing rather than failing.
 *
 * <h2>Cached, never fetched</h2>
 *
 * Implementations answer from memory. This is called from permission synchronisation and from menu
 * rendering, both on the main thread, so an implementation that has nothing cached returns
 * {@link Entitlements#free} rather than blocking on the API.
 */
public interface EntitlementSource {

    /**
     * What this player is currently entitled to, from memory.
     *
     * Never null, never blocks. A player whose data has not arrived reads as free, which is the safe
     * direction to be wrong in: a premium player briefly treated as free is an inconvenience, and a
     * free player briefly treated as premium is a chest they can lock and then cannot unlock.
     */
    Entitlements cachedFor(UUID player);

    /**
     * The same, fetching if it is not cached.
     *
     * <h2>May block — never call this on the main thread</h2>
     *
     * This exists for the one caller that genuinely needs an answer rather than a guess: permission
     * synchronisation on join, which decides whether to grant a LuckPerms group and must not grant
     * the wrong one because a fetch had not finished. It runs asynchronously.
     *
     * The default delegates to {@link #cachedFor}, so an implementation with no fetch of its own
     * satisfies the contract by being honest about only having a cache.
     */
    default Entitlements load(UUID player) {
        return cachedFor(player);
    }

    /**
     * Forgets a player, so the next read fetches again.
     *
     * Called when a tier is known to have changed. The default does nothing, which is correct for an
     * implementation that holds no cache to invalidate.
     */
    default void invalidate(UUID player) {
    }
}
