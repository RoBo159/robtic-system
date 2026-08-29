package org.robtic.core.plugin;

import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;

/**
 * The base class every Robtic plugin extends.
 *
 * It does one job before handing over: work out whether this plugin can actually run, and if it
 * cannot, say so once and get out of the way.
 *
 * <h2>Why dependencies are checked here and not by {@code depend:} in plugin.yml</h2>
 *
 * This is the part that looks like a mistake and is not.
 *
 * Bukkit's own {@code depend:} does enforce hard dependencies — by throwing
 * {@code UnknownDependencyException} during load. What a server owner sees is a wall of stack trace
 * with the real cause buried in it, and on some server software the whole load sequence aborts. That
 * is precisely the outcome the requirements rule out: no exceptions, no stack traces, one clear
 * line.
 *
 * So Robtic plugins list each other under {@code softdepend:} instead. Softdepend still guarantees
 * load <em>order</em> — RobticCore is always enabled before anything that names it — but it never
 * throws. The actual requirement is then enforced here, in code, where the failure can be a single
 * readable sentence and a graceful self-disable.
 *
 * External integrations (LuckPerms, Citizens, PlaceholderAPI, BetterStructures) are softdepend for
 * the ordinary reason as well as this one: they are genuinely optional.
 *
 * <h2>What a subclass writes</h2>
 *
 * {@link #dependencies()} and {@link #start()}. {@link #onEnable()} is final, because the checking
 * has to happen before any subclass code runs — a plugin that registered its listeners and then
 * discovered its dependency was missing would leave those listeners live on a disabled plugin.
 */
public abstract class RobticPlugin extends JavaPlugin {

    /** Optional integrations that turned out to be present, resolved once at enable. */
    private final Set<String> present = new LinkedHashSet<>();

    /**
     * Whether {@link #start()} ran.
     *
     * {@link #onDisable()} is called by Bukkit even for a plugin that disabled itself during enable,
     * so without this a plugin that never started would run its shutdown against fields that were
     * never assigned — turning one clean warning into the NullPointerException it was meant to avoid.
     */
    private boolean started;

    /**
     * What this plugin needs.
     *
     * Declared rather than checked imperatively so the graph is readable from one place, and so a
     * future tool can render the ecosystem's dependencies without running it.
     */
    protected abstract List<PluginDependency> dependencies();

    /** Everything the plugin does at enable. Only called when every required dependency is present. */
    protected abstract void start();

    /** Releases what {@link #start()} acquired. Only called if {@code start} actually ran. */
    protected void stop() {
    }

    @Override
    public final void onEnable() {
        List<PluginDependency> declared = dependencies();

        List<String> missing = new ArrayList<>();

        for (PluginDependency dependency : declared) {
            if (dependency.required() && !dependency.satisfied()) {
                missing.add(dependency.name());
            }
        }

        if (!missing.isEmpty()) {
            // One line, naming every missing dependency at once. Reporting them one per line would
            // be three warnings for a server that is missing three plugins, and the requirement is
            // one — a server owner needs the whole answer, not the first part of it.
            getLogger().severe("Missing required plugin"
                    + (missing.size() == 1 ? ": " : "s: ")
                    + String.join(", ", missing)
                    + ". " + getName() + " has been disabled.");

            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        for (PluginDependency dependency : declared) {
            if (dependency.required()) {
                continue;
            }

            if (dependency.satisfied()) {
                present.add(dependency.name());
            } else {
                // One line per absent integration, at enable, and never again. Nothing re-checks
                // later: a plugin that loads after this one cannot be picked up mid-session anyway,
                // and a periodic re-check would be the console spam the requirements rule out.
                getLogger().warning(dependency.name() + " is not installed, so "
                        + dependency.disables() + ".");
            }
        }

        try {
            start();
            started = true;
        } catch (RuntimeException | LinkageError failure) {
            // A plugin that throws during its own startup takes only itself down. The stack trace is
            // kept here — unlike a missing dependency, this is a bug rather than a configuration
            // choice, and it cannot be diagnosed without one.
            getLogger().log(Level.SEVERE, getName() + " failed to start and has been disabled."
                    + " Every other Robtic plugin is unaffected.", failure);

            getServer().getPluginManager().disablePlugin(this);
        }
    }

    @Override
    public final void onDisable() {
        if (!started) {
            return;
        }

        try {
            stop();
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(Level.WARNING, getName() + " did not shut down cleanly.", failure);
        }
    }

    /**
     * Whether an optional integration is available.
     *
     * Resolved once at enable rather than asked of the plugin manager each time. A feature checking
     * "is Citizens here" on every NPC spawn is a map lookup that can never change its answer during
     * a session, and the requirements call out repeated service lookups specifically.
     */
    public final boolean has(String plugin) {
        return present.contains(plugin);
    }
}
