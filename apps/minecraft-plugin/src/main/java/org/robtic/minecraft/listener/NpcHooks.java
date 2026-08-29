package org.robtic.minecraft.listener;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.EventExecutor;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.gui.ExchangeController;

import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.logging.Level;

/**
 * Opens the exchange from a third-party NPC plugin's own click event.
 *
 * {@link NpcInteractListener} matches on a real entity's display name, which covers Citizens and
 * anything else backed by a server-side entity. It cannot cover FancyNpcs: those NPCs exist only as
 * packets sent to the client, so no entity is ever spawned, {@code PlayerInteractEntityEvent} never
 * fires, and no amount of matching the name in config.yml will make it fire. FancyNpcs raises its
 * own event instead, and that is what this hooks.
 *
 * <h2>Why reflection</h2>
 *
 * Neither plugin is a build dependency, so their event classes may simply be absent at runtime.
 * Registering through {@link org.bukkit.plugin.PluginManager#registerEvent} with a looked-up class
 * lets the hook install itself only when the plugin is actually present, and lets a version that
 * renamed a method degrade to a logged warning rather than a {@code NoClassDefFoundError} on
 * startup.
 */
public final class NpcHooks {

    /** A do-nothing listener; the executor below is what actually runs. */
    private static final Listener HANDLE = new Listener() {
    };

    private NpcHooks() {
    }

    /**
     * Installs a hook for every supported NPC plugin that is present.
     *
     * @param npcNames names from config.yml, matched against the NPC's name case-insensitively and
     *                 ignoring colour codes.
     */
    public static void register(Plugin plugin, ExchangeController controller, List<String> npcNames) {
        List<String> wanted = npcNames.stream().map(NpcHooks::normalise).filter(name -> !name.isBlank()).toList();
        if (wanted.isEmpty()) {
            return;
        }

        hook(plugin, controller, wanted,
                "de.oliver.fancynpcs.api.events.NpcInteractEvent", "FancyNpcs",
                event -> read(read(event, "getNpc"), "getData", "getName", "getDisplayName"),
                event -> read(event, "getPlayer"));

        hook(plugin, controller, wanted,
                "net.citizensnpcs.api.event.NPCRightClickEvent", "Citizens",
                event -> read(read(event, "getNPC"), "getName"),
                event -> read(event, "getClicker"));
    }

    /**
     * Registers one plugin's click event, if its class is on the classpath.
     *
     * @param name    resolves the NPC's name from the event, trying each candidate accessor.
     * @param clicker resolves the player from the event.
     */
    @SuppressWarnings("unchecked")
    private static void hook(
            Plugin plugin,
            ExchangeController controller,
            List<String> wanted,
            String eventClassName,
            String label,
            Function<Object, Object> name,
            Function<Object, Object> clicker
    ) {
        Class<?> eventClass;
        try {
            eventClass = Class.forName(eventClassName);
        } catch (ClassNotFoundException absent) {
            // The normal case for a server that does not run this NPC plugin.
            return;
        }

        if (!Event.class.isAssignableFrom(eventClass)) {
            return;
        }

        EventExecutor executor = (ignored, event) -> {
            try {
                Object resolved = name.apply(event);
                if (resolved == null || !wanted.contains(normalise(String.valueOf(resolved)))) {
                    return;
                }

                if (clicker.apply(event) instanceof Player player) {
                    controller.openMain(player);
                }
            } catch (RuntimeException error) {
                plugin.getLogger().log(Level.WARNING,
                        "Failed to handle a " + label + " NPC interaction", error);
            }
        };

        plugin.getServer().getPluginManager().registerEvent(
                (Class<? extends Event>) eventClass, HANDLE, EventPriority.NORMAL, executor, plugin);

        plugin.getLogger().info("Hooked " + label + " — right-clicking a configured NPC opens the exchange.");
    }

    /**
     * Calls the first accessor that exists, so one hook survives a rename between plugin versions.
     * Returns null when the target is null or no candidate matched.
     */
    private static Object read(Object target, String... methods) {
        if (target == null) {
            return null;
        }

        for (String method : methods) {
            try {
                return target.getClass().getMethod(method).invoke(target);
            } catch (ReflectiveOperationException next) {
                // Try the next candidate; a miss here is expected across versions.
            }
        }

        return null;
    }

    /**
     * Strips colour codes and case so a name typed plainly in config.yml matches an NPC whose name
     * carries formatting — which is the usual way these are set up, and would otherwise never
     * compare equal.
     */
    static String normalise(String value) {
        return value
                .replaceAll("(?i)[§&][0-9A-FK-ORX]", "")
                .replaceAll("<[^>]{1,32}>", "")
                .strip()
                .toLowerCase(Locale.ROOT);
    }
}
