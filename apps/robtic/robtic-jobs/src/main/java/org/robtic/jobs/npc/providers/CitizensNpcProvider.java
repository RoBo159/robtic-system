package org.robtic.jobs.npc.providers;

import net.citizensnpcs.api.CitizensAPI;
import net.citizensnpcs.api.event.NPCRightClickEvent;
import net.citizensnpcs.api.npc.NPC;
import net.citizensnpcs.api.npc.NPCRegistry;
import net.citizensnpcs.api.npc.SimpleNPCDataStore;
import net.citizensnpcs.api.util.YamlStorage;
import org.bukkit.Location;
import org.bukkit.entity.Entity;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;
import org.robtic.core.gui.MenuItems;
import org.robtic.jobs.npc.NpcDefinition;
import org.robtic.jobs.npc.NpcHandle;
import org.robtic.jobs.npc.NpcProvider;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * NPCs backed by Citizens.
 *
 * <h2>The only class here that mentions Citizens</h2>
 *
 * Every Citizens type is confined to this file, and it is constructed only after {@link #usable}
 * confirms the plugin is installed <em>and</em> its API has an implementation. On a server without
 * Citizens the JVM never resolves these types, so nothing fails to load.
 *
 * <h2>Its own registry, in its own file</h2>
 *
 * A named registry backed by {@code plugins/RobticMinecraft/citizens-npcs.yml} rather than the
 * default one. Two reasons, and the second is the important one:
 *
 * <ul>
 *   <li>these NPCs stay out of {@code /npc list}, where they would bury an operator's own;</li>
 *   <li>a careless {@code /npc select} followed by {@code /npc remove} cannot destroy a player's
 *       workspace seller — the default registry is what those commands operate on.</li>
 * </ul>
 *
 * The registry persists, so its NPCs survive restarts exactly as ordinary Citizens NPCs do.
 *
 * <h2>Identity</h2>
 *
 * Citizens NPCs carry their own persistent metadata store, saved with the NPC, which is where the
 * definition and owner tags go. A handle therefore resolves after a restart with this plugin keeping
 * no index of its own.
 */
public final class CitizensNpcProvider implements NpcProvider, Listener {

    public static final String NAME = "citizens";

    /** Metadata keys. Prefixed so they cannot collide with another plugin's. */
    private static final String DEFINITION_KEY = "robtic-npc-definition";
    private static final String OWNER_KEY = "robtic-npc-owner";

    private static final String REGISTRY_NAME = "robtic";

    private final Plugin plugin;
    private final NPCRegistry registry;

    private volatile NpcInteraction handler = (player, handle) -> {
    };

    private CitizensNpcProvider(Plugin plugin, NPCRegistry registry) {
        this.plugin = plugin;
        this.registry = registry;

        plugin.getServer().getPluginManager().registerEvents(this, plugin);
    }

    /**
     * Builds the provider, or returns empty when Citizens cannot be used.
     *
     * Catches {@link Throwable} rather than {@link Exception}: a missing class arrives as
     * {@link NoClassDefFoundError}, which an Exception catch would let through and turn into a
     * failed plugin start.
     */
    public static Optional<NpcProvider> createIfPresent(Plugin plugin) {
        if (!usable(plugin)) {
            return Optional.empty();
        }

        try {
            NPCRegistry existing = CitizensAPI.getNamedNPCRegistry(REGISTRY_NAME);

            NPCRegistry registry = existing != null ? existing : CitizensAPI.createNamedNPCRegistry(
                    REGISTRY_NAME,
                    SimpleNPCDataStore.create(new YamlStorage(
                            new File(plugin.getDataFolder(), "citizens-npcs.yml"),
                            "Robtic workspace and recruitment NPCs")));

            plugin.getLogger().info("Using Citizens for progression NPCs.");

            return Optional.of(new CitizensNpcProvider(plugin, registry));
        } catch (Throwable unavailable) {
            plugin.getLogger().warning("Citizens is installed but its API is unusable ("
                    + unavailable + "). Falling back to another NPC backend.");
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
        } catch (Throwable notReady) {
            return false;
        }
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean available() {
        return usable(plugin);
    }

    @Override
    public void onInteract(NpcInteraction handler) {
        this.handler = handler == null ? (player, handle) -> {
        } : handler;
    }

    @Override
    public Optional<NpcHandle> spawn(NpcDefinition definition, Location location, String owner) {
        if (location.getWorld() == null) {
            return Optional.empty();
        }

        NPC npc = null;

        try {
            npc = registry.createNPC(definition.type(), MenuItems.plain(definition.name()));

            // Tagged before spawning, so the tags exist even if the spawn is refused — an untagged
            // NPC is one nothing can later identify or clean up.
            npc.data().setPersistent(DEFINITION_KEY, definition.id());
            npc.data().setPersistent(OWNER_KEY, owner);

            npc.setProtected(true);
            npc.data().setPersistent(NPC.Metadata.NAMEPLATE_VISIBLE, true);
            npc.data().setPersistent(NPC.Metadata.COLLIDABLE, false);
            npc.data().setPersistent(NPC.Metadata.SILENT, true);

            if (definition.glowing()) {
                npc.data().setPersistent(NPC.Metadata.GLOWING, true);
            }

            // Looking at players is Citizens' LookClose trait, which ships in the Citizens plugin
            // jar rather than in citizensapi — so it cannot be referenced at compile time here.
            // Operators who want it can add it with `/npc select` and `/trait lookclose`; the NPC
            // works identically without it.

            if (!npc.spawn(location)) {
                // Registered but not in the world. Destroyed rather than left behind, so failed
                // spawns do not accumulate as invisible NPCs across restarts.
                npc.destroy();
                return Optional.empty();
            }

            return Optional.of(NpcHandle.of(NAME, npc.getUniqueId()));
        } catch (Throwable failure) {
            // Whatever went wrong, do not leave a half-created NPC registered.
            if (npc != null) {
                try {
                    npc.destroy();
                } catch (Throwable ignored) {
                    // Already gone, or Citizens is in a state where it cannot say. Nothing useful
                    // to do, and throwing here would replace the real failure with this one.
                }
            }

            plugin.getLogger().warning("Citizens could not spawn the NPC \"" + definition.id()
                    + "\": " + failure.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public boolean remove(NpcHandle handle) {
        return npc(handle).map(npc -> {
            npc.destroy();
            return true;
        }).orElse(false);
    }

    @Override
    public boolean exists(NpcHandle handle) {
        return npc(handle).isPresent();
    }

    @Override
    public Optional<NpcHandle> identify(Entity entity) {
        try {
            NPC npc = registry.getNPC(entity);

            return npc != null && npc.data().has(DEFINITION_KEY)
                    ? Optional.of(NpcHandle.of(NAME, npc.getUniqueId()))
                    : Optional.empty();
        } catch (Throwable unavailable) {
            return Optional.empty();
        }
    }

    @Override
    public Optional<String> definitionOf(NpcHandle handle) {
        return npc(handle).map(npc -> npc.data().<String>get(DEFINITION_KEY));
    }

    @Override
    public Optional<String> ownerOf(NpcHandle handle) {
        return npc(handle).map(npc -> npc.data().<String>get(OWNER_KEY));
    }

    @Override
    public int removeAllOwnedBy(String owner) {
        int removed = 0;

        try {
            // Copied before destroying: destroy() mutates the registry, and iterating it while it
            // changes throws a ConcurrentModificationException.
            List<NPC> all = new ArrayList<>();
            registry.forEach(all::add);

            for (NPC npc : all) {
                if (owner.equals(npc.data().get(OWNER_KEY))) {
                    npc.destroy();
                    removed++;
                }
            }
        } catch (Throwable failure) {
            plugin.getLogger().warning("Citizens cleanup for \"" + owner + "\" failed: "
                    + failure.getMessage());
        }

        return removed;
    }

    private Optional<NPC> npc(NpcHandle handle) {
        if (!handle.isFrom(NAME)) {
            return Optional.empty();
        }

        Optional<UUID> id = handle.asUuid();

        if (id.isEmpty()) {
            return Optional.empty();
        }

        try {
            return Optional.ofNullable(registry.getByUniqueId(id.get()))
                    .filter(npc -> npc.data().has(DEFINITION_KEY));
        } catch (Throwable unavailable) {
            return Optional.empty();
        }
    }

    /**
     * Citizens raises its own click event rather than a Bukkit interact event.
     *
     * Filtered on our definition tag, so an operator's own Citizens NPCs pass straight through.
     */
    @EventHandler(priority = EventPriority.HIGH)
    public void onRightClick(NPCRightClickEvent event) {
        if (!event.getNPC().data().has(DEFINITION_KEY)) {
            return;
        }

        handler.accept(event.getClicker(), NpcHandle.of(NAME, event.getNPC().getUniqueId()));
    }

    /** Flushes the registry to disk, so a shutdown does not lose NPCs created this session. */
    @Override
    public void shutdown() {
        try {
            registry.saveToStore();
        } catch (Throwable failure) {
            plugin.getLogger().warning("Could not save the Citizens NPC registry: "
                    + failure.getMessage());
        }
    }
}
