package org.robtic.core.entitlement;

import java.util.OptionalInt;
import java.util.UUID;

/**
 * What a player is entitled to beyond the baseline.
 *
 * <h2>Why this interface is in Core and not in RobticPremium</h2>
 *
 * Premium is not a set of features. It is a tier that raises limits on features owned by other
 * plugins: how many homes a player may set, how many chests they may lock, how often they may use
 * {@code /back}, whether cosmetics are available, how many workspaces they may claim, how many
 * professions they may hold.
 *
 * Every one of those features lives somewhere else — in RobticEssentials, in RobticJobs — and those
 * plugins must not depend on RobticPremium. Feature plugins depending on each other is the coupling
 * the whole refactor exists to remove, and it would put a premium plugin on the critical path of
 * being able to set a home.
 *
 * So the <em>contract</em> lives in Core, RobticPremium registers an implementation of it, and
 * Essentials and Jobs ask Core. If Premium is not installed, {@link #NONE} answers, every player is
 * tier zero, and each feature falls back to its own free-tier configuration. Nothing breaks and no
 * command disappears.
 *
 * <h2>Why the answers are optional rather than zero</h2>
 *
 * "No premium plugin is installed" and "this player's premium tier grants zero extra homes" are
 * different facts and must not collapse into the same value. An empty {@link OptionalInt} means
 * nobody has an opinion, so the caller uses its own default; a present zero means something
 * deliberately granted nothing. Returning 0 for both is how a server without RobticPremium ends up
 * with every player limited to zero homes.
 */
public interface EntitlementService {

    /**
     * The player's tier. Zero means no premium.
     *
     * Higher is more. The scale is defined by whatever registers this service, so nothing here
     * assumes a particular number of tiers.
     */
    int tier(UUID player);

    /**
     * A numeric allowance.
     *
     * @param key a stable, lowercase name for the limit — {@code homes}, {@code locked-chests},
     *            {@code back-uses}, {@code workspaces}, {@code professions}. Owned by the plugin
     *            that consumes it, not by this interface, so a new limit needs no change here
     * @return empty when nothing grants an opinion, in which case the caller applies its own free
     *         default
     */
    OptionalInt limit(UUID player, String key);

    /**
     * Whether a boolean perk is granted.
     *
     * @param feature a stable, lowercase name — {@code cosmetics}, {@code portable-chest}
     * @return false when nothing grants it, which is the correct baseline for a perk
     */
    boolean allows(UUID player, String feature);

    /**
     * The answer when no premium plugin is installed.
     *
     * Every player is tier zero, no limit has an opinion, and no perk is granted. Deliberately not
     * a null check at every call site: a consumer resolves the service once through
     * {@code RobticServices.findOr(EntitlementService.class, EntitlementService.NONE)} and then
     * writes the same code whether or not RobticPremium exists.
     */
    EntitlementService NONE = new EntitlementService() {

        @Override
        public int tier(UUID player) {
            return 0;
        }

        @Override
        public OptionalInt limit(UUID player, String key) {
            return OptionalInt.empty();
        }

        @Override
        public boolean allows(UUID player, String feature) {
            return false;
        }
    };
}
