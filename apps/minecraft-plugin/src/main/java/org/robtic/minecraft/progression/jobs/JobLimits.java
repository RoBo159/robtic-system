package org.robtic.minecraft.progression.jobs;

import org.bukkit.configuration.ConfigurationSection;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.function.ToIntFunction;
import java.util.logging.Logger;

/**
 * How many jobs a player may own and work at once.
 *
 * <h2>Owned and active are limited separately</h2>
 *
 * <pre>
 *   free      owned 1   active 1
 *   tier 1    owned 2   active 1
 *   tier 2    owned 3   active 2
 * </pre>
 *
 * Those are defaults in {@code jobs.yml}, not constants — a server running a promotion should be
 * able to change them without a release.
 *
 * The two limits do different work. The owned limit is what makes discovering a structure feel like
 * a decision, because a free player choosing Miner is choosing not to be a Farmer. The active limit
 * is what premium actually sells: not more progress, but more of it at once. Because switching
 * preserves everything (see {@link PlayerJobs}), a tier-1 player genuinely has two jobs and simply
 * works them one at a time.
 *
 * <h2>Where the tier comes from</h2>
 *
 * Injected as a function, so this class never learns that premium, Discord or the survival cache
 * exist. The wiring supplies one that reads the entitlements this plugin already caches.
 */
public final class JobLimits {

    /** @param owned maximum professions held; @param active maximum earning at once */
    public record Limit(int owned, int active) {
        public Limit {
            owned = Math.max(0, owned);
            // Active above owned is meaningless — you cannot work more jobs than you have — and
            // clamping here means no caller has to defend against the inverted case.
            active = Math.max(0, Math.min(active, owned));
        }
    }

    /** What a player with no premium tier gets. */
    private final Limit base;

    /** Tier number → limit. Sorted so an unknown tier can fall back to the highest below it. */
    private final Map<Integer, Limit> tiers;

    /** Resolves a player's premium tier. 0 means none. */
    private final ToIntFunction<UUID> tierOf;

    /** Whether a player bypasses limits entirely — {@code robtic.tester}, in practice. */
    private final Predicate<UUID> unlimited;

    public JobLimits(
            Limit base,
            Map<Integer, Limit> tiers,
            ToIntFunction<UUID> tierOf,
            Predicate<UUID> unlimited
    ) {
        this.base = base;
        this.tiers = Map.copyOf(tiers);
        this.tierOf = tierOf;
        this.unlimited = unlimited;
    }

    /**
     * Parses the {@code limits} section, falling back to the documented defaults.
     *
     * A missing section is not a warning. Free 1/1, tier 1 2/1 and tier 2 3/2 are the intended
     * behaviour, and a server that is happy with them should not have to write them out.
     */
    public static JobLimits parse(
            ConfigurationSection section,
            ToIntFunction<UUID> tierOf,
            Predicate<UUID> unlimited,
            Logger logger
    ) {
        Limit base = new Limit(1, 1);
        Map<Integer, Limit> tiers = new LinkedHashMap<>();
        tiers.put(1, new Limit(2, 1));
        tiers.put(2, new Limit(3, 2));

        if (section == null) {
            return new JobLimits(base, tiers, tierOf, unlimited);
        }

        ConfigurationSection defaults = section.getConfigurationSection("default");

        if (defaults != null) {
            base = new Limit(defaults.getInt("owned", 1), defaults.getInt("active", 1));
        }

        ConfigurationSection tierSection = section.getConfigurationSection("tiers");

        if (tierSection != null) {
            tiers.clear();

            for (String key : tierSection.getKeys(false)) {
                int tier;

                try {
                    tier = Integer.parseInt(key.trim());
                } catch (NumberFormatException notANumber) {
                    logger.warning("jobs.yml → limits → tiers: \"" + key
                            + "\" is not a tier number and was ignored.");
                    continue;
                }

                ConfigurationSection body = tierSection.getConfigurationSection(key);

                if (body == null) {
                    continue;
                }

                tiers.put(tier, new Limit(body.getInt("owned", 1), body.getInt("active", 1)));
            }
        }

        return new JobLimits(base, tiers, tierOf, unlimited);
    }

    /**
     * The limit applying to a player right now.
     *
     * An unrecognised tier resolves to the highest configured tier at or below it, so a server that
     * later adds tier 5 without adding limits for it gives those players tier 2's allowance rather
     * than dropping them to free.
     */
    public Limit forPlayer(UUID playerId) {
        if (unlimited.test(playerId)) {
            return new Limit(Integer.MAX_VALUE, Integer.MAX_VALUE);
        }

        int tier = tierOf.applyAsInt(playerId);

        if (tier <= 0) {
            return base;
        }

        Limit exact = tiers.get(tier);

        if (exact != null) {
            return exact;
        }

        Limit best = base;

        for (Map.Entry<Integer, Limit> entry : tiers.entrySet()) {
            if (entry.getKey() <= tier && entry.getValue().owned() >= best.owned()) {
                best = entry.getValue();
            }
        }

        return best;
    }

    /** Whether this player may take on another job. */
    public boolean mayOwnAnother(UUID playerId, PlayerJobs jobs) {
        return jobs.ownedCount() < forPlayer(playerId).owned();
    }

    /** Whether this player may make another job active without deactivating one. */
    public boolean mayActivateAnother(UUID playerId, PlayerJobs jobs) {
        return jobs.activeCount() < forPlayer(playerId).active();
    }
}
