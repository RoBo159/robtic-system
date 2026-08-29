package org.robtic.market;

import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.EventExecutor;
import org.bukkit.plugin.Plugin;
import org.robtic.market.ExchangeController;

import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.logging.Level;

/**
 * Opens the exchange from Citizens' own click event.
 *
 * {@link NpcInteractListener} matches on a real entity's display name, which already covers most
 * Citizens setups. This hooks {@code NPCRightClickEvent} as well, because Citizens delivers a click
 * through its own event and matching that is more precise than matching a display name.
 *
 * <h2>FancyNpcs was hooked here too, and has been removed</h2>
 *
 * Its NPCs are packets with no server-side entity, so it needed its own event — which meant a second
 * reflective hook against {@code de.oliver.fancynpcs.api}, an artifact that is not a build dependency
 * and could only ever be reached by name. Citizens is the one backend this server runs, and the same
 * removal has been made in RobticJobs' NPC backend.
 *
 * <h2>Why reflection</h2>
 *
 * Citizens is not a build dependency of this module, so its event class may simply be absent at
 * runtime. Registering through {@link org.bukkit.plugin.PluginManager#registerEvent} with a looked-up
 * class lets the hook install itself only when Citizens is actually present, and lets a version that
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
     * Installs the Citizens hook, if Citizens is present.
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
