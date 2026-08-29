package org.robtic.essentials.survival;

import org.robtic.core.entitlement.EntitlementSource;
import org.robtic.core.entitlement.Entitlements;

import java.util.UUID;

/**
 * Publishes the survival cache's entitlements to the rest of the ecosystem.
 *
 * <h2>Why an adapter and not the cache itself</h2>
 *
 * {@link SurvivalCacheService} caches homes, friends, settings, locked chests and entitlements, and
 * exposes a dozen methods to match. Registering it as the entitlement source would publish all of
 * that to any plugin that asked, and would tie the contract to a class whose shape is driven by what
 * the survival features happen to need.
 *
 * Three methods is the whole dependency. RobticPremium reads them and does not know that homes
 * exist.
 *
 * <h2>Why Essentials is the holder at all</h2>
 *
 * It is not obvious that a homes-and-friends plugin should own premium data. It does because the API
 * returns entitlements in the same player payload as everything else the survival cache warms on
 * join — so the value is already in memory, fetched by a request that had to happen anyway. Having
 * RobticPremium fetch it separately would double the request and put two caches out of step.
 *
 * If Essentials is ever not installed, nothing registers a source, RobticPremium logs one line and
 * applies no groups.
 */
public final class CachedEntitlements implements EntitlementSource {

    private final SurvivalCacheService cache;

    public CachedEntitlements(SurvivalCacheService cache) {
        this.cache = cache;
    }

    @Override
    public Entitlements cachedFor(UUID player) {
        return cache.cachedPremium(player);
    }

    /** Blocking. The contract already says main-thread callers must use {@link #cachedFor}. */
    @Override
    public Entitlements load(UUID player) {
        return cache.loadPremium(player);
    }

    @Override
    public void invalidate(UUID player) {
        cache.invalidatePremium(player);
    }
}
