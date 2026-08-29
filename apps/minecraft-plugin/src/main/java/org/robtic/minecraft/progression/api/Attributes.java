package org.robtic.minecraft.progression.api;

import org.robtic.minecraft.util.Ids;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Routes an attribute path such as {@code job.miner.level} to whichever system publishes it.
 *
 * <h2>Why a router and not a map of values</h2>
 *
 * A snapshot map would have to be rebuilt whenever anything changed, and "anything" here means every
 * XP gain of every player. Routing to the owning system instead means the value is computed on
 * demand from the data that system already holds in memory, and there is no second copy to keep in
 * step — which is the same reasoning that keeps earned Robs out of the AFK cache.
 *
 * <h2>Threading</h2>
 *
 * Registration happens at boot on the main thread; lookups happen on the tick. The map is concurrent
 * only so a module enabling late cannot race a lookup, not because writes are expected at runtime.
 *
 * @see AttributeProvider for why this seam exists at all
 */
public final class Attributes {

    private final Map<String, AttributeProvider> providers = new ConcurrentHashMap<>();
    private final Logger logger;

    public Attributes(Logger logger) {
        this.logger = logger;
    }

    /**
     * Claims a namespace.
     *
     * A second claim on the same namespace is refused and reported rather than replacing the first.
     * Silently overwriting would make unlock conditions answer differently depending on module load
     * order, and load order is not something an operator can see.
     */
    public void register(AttributeProvider provider) {
        String namespace = Ids.normalise(provider.namespace());

        if (!Ids.valid(namespace)) {
            logger.warning("Refusing an attribute provider with the namespace \"" + namespace
                    + "\": " + Ids.describeProblem(namespace) + ".");
            return;
        }

        AttributeProvider existing = providers.putIfAbsent(namespace, provider);

        if (existing != null) {
            logger.warning("Two systems both claim the attribute namespace \"" + namespace
                    + "\". Keeping " + existing.getClass().getSimpleName()
                    + " and ignoring " + provider.getClass().getSimpleName() + ".");
        }
    }

    /**
     * Resolves a numeric attribute.
     *
     * @param path a dotted path whose first segment names the provider, e.g. {@code job.miner.level}
     * @return empty when no provider claims the namespace, or the provider has no value. The caller
     *         must not treat that as zero — see {@link AttributeProvider}
     */
    public OptionalDouble number(UUID player, String path) {
        int split = path.indexOf('.');

        if (split <= 0 || split == path.length() - 1) {
            return OptionalDouble.empty();
        }

        AttributeProvider provider = providers.get(Ids.normalise(path.substring(0, split)));

        return provider == null
                ? OptionalDouble.empty()
                : provider.number(player, path.substring(split + 1));
    }

    /** Resolves a textual attribute. Same routing rules as {@link #number}. */
    public Optional<String> text(UUID player, String path) {
        int split = path.indexOf('.');

        if (split <= 0 || split == path.length() - 1) {
            return Optional.empty();
        }

        AttributeProvider provider = providers.get(Ids.normalise(path.substring(0, split)));

        return provider == null
                ? Optional.empty()
                : provider.text(player, path.substring(split + 1));
    }

    /** Whether anything claims this namespace, so a config check can warn about a dead condition. */
    public boolean claimed(String namespace) {
        return providers.containsKey(Ids.normalise(namespace));
    }
}
