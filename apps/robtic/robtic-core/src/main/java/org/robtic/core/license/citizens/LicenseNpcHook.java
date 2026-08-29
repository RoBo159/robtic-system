package org.robtic.core.license.citizens;

import net.citizensnpcs.api.CitizensAPI;
import net.citizensnpcs.api.event.NPCRightClickEvent;
import net.citizensnpcs.api.npc.NPC;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;
import org.robtic.core.license.events.LicenseNpcOpenEvent;
import org.robtic.core.license.gui.LicenseBrowser;

import java.util.Optional;
import java.util.function.Consumer;

/**
 * The Citizens half of the licence NPC.
 *
 * <h2>The only class here that mentions Citizens</h2>
 *
 * Every Citizens type is confined to this file, and it is constructed only after {@link #usable}
 * confirms the plugin is installed <em>and</em> its API has an implementation. On a server without
 * Citizens the JVM never resolves these types, so nothing fails to load and the rest of the licence
 * system works exactly as it does with them — minus the NPC, which is what {@code /license} is for.
 *
 * The same pattern the progression module's Citizens provider uses, for the same reason.
 *
 * <h2>A right-click opens the browser, not a shop</h2>
 *
 * Deliberately, and it is the one behavioural requirement of the NPC. The event fired first is
 * cancellable, so a future system can put a dialogue, a reputation check or a queue in front of it
 * without this class learning what any of those are.
 */
public final class LicenseNpcHook implements Listener {

    private final Plugin plugin;
    private final LicenseNpcStore store;
    private final LicenseBrowser browser;

    private LicenseNpcHook(Plugin plugin, LicenseNpcStore store, LicenseBrowser browser) {
        this.plugin = plugin;
        this.store = store;
        this.browser = browser;
    }

    /**
     * Creates the hook, or nothing when Citizens is absent.
     *
     * @return empty on a server without Citizens, which is not a failure — the licence system runs
     *         without an NPC and says so once at enable
     */
    public static Optional<LicenseNpcHook> createIfPresent(
            Plugin plugin, LicenseNpcStore store, LicenseBrowser browser) {

        if (!usable(plugin)) {
            return Optional.empty();
        }

        try {
            LicenseNpcHook hook = new LicenseNpcHook(plugin, store, browser);
            plugin.getServer().getPluginManager().registerEvents(hook, plugin);

            return Optional.of(hook);
        } catch (RuntimeException | LinkageError unavailable) {
            plugin.getLogger().warning("Citizens is installed but its API is unusable ("
                    + unavailable + "). Licence NPCs are disabled; /license still works.");

            return Optional.empty();
        }
    }

    private static boolean usable(Plugin plugin) {
        if (plugin.getServer().getPluginManager().getPlugin("Citizens") == null) {
            return false;
        }

        try {
            // The difference between "the jar is present" and "Citizens has finished enabling".
            // Called during our own enable, the second is not guaranteed.
            return CitizensAPI.hasImplementation();
        } catch (RuntimeException | LinkageError unavailable) {
            return false;
        }
    }

    /**
     * The NPC a command sender currently has selected.
     *
     * How {@code /license setnpc} knows which NPC an operator means: they select one with
     * {@code /npc select} — or by creating it, which selects it — exactly as they do for every other
     * Citizens command. Inventing a separate selection mechanism would be a second thing to learn
     * for no benefit.
     *
     * @return empty when nothing is selected, or when the selection is not an NPC
     */
    public Optional<Integer> selectedNpc(CommandSender sender) {
        try {
            NPC selected = CitizensAPI.getDefaultNPCSelector().getSelected(sender);

            return selected == null ? Optional.empty() : Optional.of(selected.getId());
        } catch (RuntimeException | LinkageError unavailable) {
            return Optional.empty();
        }
    }

    /** The name of an NPC by id, for a command's confirmation message. */
    public Optional<String> nameOf(int npcId) {
        try {
            NPC npc = CitizensAPI.getNPCRegistry().getById(npcId);

            return npc == null ? Optional.empty() : Optional.of(npc.getName());
        } catch (RuntimeException | LinkageError unavailable) {
            return Optional.empty();
        }
    }

    /**
     * Opens the browser when a licence NPC is right-clicked.
     *
     * The event is cancelled so Citizens does not also run whatever else is bound to the NPC — a
     * licence NPC that opened the browser *and* a shop would be two menus fighting over one click.
     */
    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
    public void onRightClick(NPCRightClickEvent event) {
        int npcId = event.getNPC().getId();

        if (!store.contains(npcId)) {
            return;
        }

        Player player = event.getClicker();

        event.setCancelled(true);

        if (LicenseNpcOpenEvent.hasListeners()) {
            LicenseNpcOpenEvent opening = new LicenseNpcOpenEvent(player, npcId);
            plugin.getServer().getPluginManager().callEvent(opening);

            if (opening.isCancelled()) {
                return;
            }
        }

        browser.open(player);
    }

    /** Runs an action for each licence NPC that still exists, for {@code /license debug}. */
    public void forEachLive(Consumer<String> action) {
        for (int id : store.all()) {
            nameOf(id).ifPresentOrElse(
                    name -> action.accept("#" + id + " \"" + name + "\""),
                    () -> action.accept("#" + id + " (no such NPC)"));
        }
    }
}
