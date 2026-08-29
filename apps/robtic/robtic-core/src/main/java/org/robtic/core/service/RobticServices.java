package org.robtic.core.service;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.ServicePriority;

import java.util.Optional;

/**
 * How one Robtic plugin reaches another's services.
 *
 * <h2>Built on Bukkit's own registry, not beside it</h2>
 *
 * Bukkit already has a cross-plugin service registry, and it already solves the hard parts:
 * services are unregistered automatically when their owning plugin disables, and a lookup returns
 * the current provider rather than a reference captured at some earlier moment. Writing a second
 * registry next to it would mean reimplementing both of those and getting the first one wrong, which
 * is how a disabled plugin's service stays reachable and hands out a manager whose plugin is gone.
 *
 * This class is a typed front door onto it: {@code Optional} instead of null, and a single place to
 * document the contract.
 *
 * <h2>The rule this exists to enforce</h2>
 *
 * A feature plugin never constructs another plugin's manager and never casts its way to one through
 * {@code getPlugin}. It asks for an <em>interface</em>, which lives in Core, and gets whatever is
 * registered — or nothing, which it must handle. That is what keeps RobticJobs compiling against
 * RobticWorld's contract rather than its implementation, and what lets a future plugin replace a
 * provider without anybody editing the consumer.
 *
 * <h2>Look up once, hold the result — with care</h2>
 *
 * Resolving a service per call is a synchronised map lookup, and the requirements call out repeated
 * lookups. Holding the result across a reload of the providing plugin is the opposite mistake. The
 * safe pattern is to resolve at enable and re-resolve on a plugin-enable event if the provider is
 * genuinely optional; for a required dependency, enable-time is enough, because
 * {@link org.robtic.core.plugin.RobticPlugin} has already guaranteed the provider is up.
 */
public final class RobticServices {

    private RobticServices() {
    }

    /**
     * Publishes a service.
     *
     * Registered at {@link ServicePriority#Normal}. A server owner who wants to replace a Robtic
     * service with their own registers theirs at a higher priority, and every consumer picks it up
     * with no code change anywhere — which is the extension point future plugins are promised.
     *
     * @param owner    the plugin providing it, so Bukkit can withdraw it when that plugin stops
     * @param contract the interface, always. Registering a concrete class would make every consumer
     *                 depend on the implementation and defeat the point
     */
    public static <T> void register(Plugin owner, Class<T> contract, T implementation) {
        Bukkit.getServicesManager().register(contract, implementation, owner, ServicePriority.Normal);
    }

    /** Publishes a service that should win over any already registered. */
    public static <T> void registerPreferred(Plugin owner, Class<T> contract, T implementation) {
        Bukkit.getServicesManager().register(contract, implementation, owner, ServicePriority.High);
    }

    /**
     * The current provider of a service.
     *
     * @return empty when nothing provides it — which is the normal state for anything an optional
     *         plugin registers, and must be handled rather than asserted away
     */
    public static <T> Optional<T> find(Class<T> contract) {
        return Optional.ofNullable(Bukkit.getServicesManager().load(contract));
    }

    /**
     * The current provider, or a fallback.
     *
     * The shape most callers want: a plugin whose optional collaborator is absent usually has a
     * do-nothing implementation ready rather than a branch at every call site. See
     * {@code EntitlementService} for the pattern.
     */
    public static <T> T findOr(Class<T> contract, T fallback) {
        T found = Bukkit.getServicesManager().load(contract);

        return found != null ? found : fallback;
    }

    public static boolean has(Class<?> contract) {
        return Bukkit.getServicesManager().load(contract) != null;
    }

    /**
     * Every provider of a service, not just the winning one.
     *
     * <h2>The one case where "load" is the wrong question</h2>
     *
     * {@link #find} answers "who provides this?", which is right for a service with one authority —
     * one economy, one entitlement source. It is wrong for a contract several plugins are each
     * expected to answer independently, where taking only the highest-priority provider would
     * silently discard the rest.
     *
     * {@link org.robtic.core.discord.DiscordDocument} is that case: every plugin contributes its own
     * section of one document, and dropping all but one would push a configuration missing most of
     * the server.
     *
     * Returned in registration order, which is plugin load order — so a conflict between two
     * contributors resolves the same way on every start rather than by hash order.
     */
    public static <T> java.util.List<T> findAll(Class<T> contract) {
        java.util.List<T> found = new java.util.ArrayList<>();

        for (var registration : Bukkit.getServicesManager().getRegistrations(contract)) {
            found.add(registration.getProvider());
        }

        return java.util.List.copyOf(found);
    }

    /**
     * Withdraws every service a plugin registered.
     *
     * Bukkit does this automatically when a plugin is disabled, so this is only for a plugin that
     * wants to retract a service while staying enabled — a backend being swapped at runtime, for
     * instance.
     */
    public static void withdrawAll(Plugin owner) {
        Bukkit.getServicesManager().unregisterAll(owner);
    }
}
