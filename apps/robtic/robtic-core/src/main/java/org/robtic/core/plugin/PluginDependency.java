package org.robtic.core.plugin;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

/**
 * One plugin this plugin needs, and how badly.
 *
 * <h2>Required versus optional</h2>
 *
 * A {@link #required} dependency is one the plugin cannot function without at all — RobticJobs
 * without RobticWorld has no structures to build workspaces in, so there is nothing for it to do.
 * The plugin disables itself and says so once.
 *
 * An optional one turns a feature off and leaves everything else running: no Citizens means NPCs
 * fall back to the built-in backend, no PlaceholderAPI means placeholders are not registered. One
 * line in the log, and the server carries on.
 *
 * @param name    the plugin name exactly as it appears in its own plugin.yml
 * @param required whether this plugin can run without it
 * @param disables what stops working when an optional dependency is absent, phrased to finish the
 *                 sentence "…so X is unavailable". Ignored for required dependencies
 */
public record PluginDependency(String name, boolean required, String disables) {

    public static PluginDependency required(String name) {
        return new PluginDependency(name, true, "");
    }

    /**
     * @param disables what is lost without it — "NPCs will use the built-in backend",
     *                 "placeholders will not be registered"
     */
    public static PluginDependency optional(String name, String disables) {
        return new PluginDependency(name, false, disables);
    }

    /**
     * Whether the plugin is present <em>and enabled</em>.
     *
     * Both matter. A plugin that failed its own startup is still installed, still returned by
     * {@code getPlugin}, and cannot be used — treating it as present is how one broken plugin turns
     * into three broken plugins.
     */
    public boolean satisfied() {
        Plugin found = Bukkit.getPluginManager().getPlugin(name);

        return found != null && found.isEnabled();
    }
}
