package org.robtic.minecraft.progression.npc.providers;

import org.bukkit.Location;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.npc.NpcDefinition;
import org.robtic.minecraft.progression.npc.NpcHandle;
import org.robtic.minecraft.progression.npc.NpcProvider;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * NPCs backed by FancyNPCs, reached entirely through reflection.
 *
 * <h2>Why reflection here and a real dependency for Citizens</h2>
 *
 * Not a stylistic choice. The published {@code de.oliver:FancyNpcs} artifact contains only its own
 * API classes, and those classes' signatures reference {@code de.oliver.fancylib},
 * {@code de.oliver.fancyanalytics} and {@code com.fancyinnovations.config} — none of which it
 * bundles or declares as dependencies. javac therefore cannot read {@code FancyNpcsPlugin} at all
 * ("cannot access"), and compiling against it means pinning three further artifacts by hand and
 * re-pinning them on every FancyNPCs release.
 *
 * Reflection over the eleven methods below is the smaller and steadier cost. It also means this
 * plugin builds without their repository being reachable, and survives the API churn FancyNPCs has
 * had across 2.x — a renamed method degrades to "FancyNPCs unavailable, using another backend"
 * rather than to a plugin that will not load.
 *
 * <h2>Preferred at runtime nonetheless</h2>
 *
 * Its NPCs are packets rather than entities: no mob cap, no entity ticks, nothing to accidentally
 * kill. On a server with a few hundred workspaces each staffed by a seller, that is a real
 * difference, which is why {@code NpcBackend} picks it first when it is installed.
 *
 * <h2>Everything is resolved once, at construction</h2>
 *
 * If any method is missing the provider refuses to construct, so the failure happens at boot with a
 * clear message rather than at the first structure a player discovers. Nothing below re-resolves.
 */
public final class FancyNpcsProvider implements NpcProvider {

    public static final String NAME = "fancynpcs";

    /** Marks an id as ours, and separates the fields encoded into it. */
    private static final String PREFIX = "robtic";
    private static final String SEPARATOR = "|";

    private final Plugin plugin;

    /** The resolved API surface. Immutable after construction. */
    private final Api api;

    /**
     * Owner tags for ids created this session.
     *
     * A cache only — every value is recoverable from the id itself, which is what makes a restart
     * harmless. See {@link #encode}.
     */
    private final Map<String, String> owners = new ConcurrentHashMap<>();

    private volatile NpcInteraction handler = (player, handle) -> {
    };

    private FancyNpcsProvider(Plugin plugin, Api api) {
        this.plugin = plugin;
        this.api = api;
    }

    public static Optional<NpcProvider> createIfPresent(Plugin plugin) {
        if (plugin.getServer().getPluginManager().getPlugin("FancyNpcs") == null) {
            return Optional.empty();
        }

        try {
            Api api = Api.resolve();

            plugin.getLogger().info("Using FancyNPCs for progression NPCs.");

            return Optional.of(new FancyNpcsProvider(plugin, api));
        } catch (Throwable unusable) {
            // Names the method that could not be found, which is the only useful thing to say when
            // an upstream API has moved.
            plugin.getLogger().warning("FancyNPCs is installed but its API could not be resolved ("
                    + unusable + "). Falling back to another NPC backend.");
            return Optional.empty();
        }
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean available() {
        return plugin.getServer().getPluginManager().getPlugin("FancyNpcs") != null;
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

        String id = encode(definition.id(), owner);
        NpcHandle handle = NpcHandle.of(NAME, id);

        try {
            // NpcData(String name, UUID creator, Location). Creator is null: these are the server's,
            // not any player's, and FancyNPCs treats null as unowned.
            Object data = api.npcDataConstructor.newInstance(id, null, location);

            api.setDisplayName.invoke(data, definition.name());
            api.setType.invoke(data, definition.type());
            api.setGlowing.invoke(data, definition.glowing());
            api.setTurnToPlayer.invoke(data, definition.lookAtPlayers());
            api.setCollidable.invoke(data, false);
            api.setShowInTab.invoke(data, false);

            // The click path. These NPCs have no entity, so this consumer is the only way a click
            // ever reaches the plugin — see identify().
            Consumer<Player> onClick = player -> handler.accept(player, handle);
            api.setOnClick.invoke(data, onClick);

            Object manager = api.npcManager();

            @SuppressWarnings("unchecked")
            Function<Object, Object> adapter = (Function<Object, Object>) api.npcAdapter();
            Object npc = adapter.apply(data);

            api.create.invoke(npc);
            api.registerNpc.invoke(manager, npc);
            api.spawnForAll.invoke(npc);

            owners.put(id, owner);

            return Optional.of(handle);
        } catch (Throwable failure) {
            plugin.getLogger().warning("FancyNPCs could not spawn the NPC \"" + definition.id()
                    + "\": " + failure);
            return Optional.empty();
        }
    }

    @Override
    public boolean remove(NpcHandle handle) {
        Optional<Object> npc = npc(handle);

        if (npc.isEmpty()) {
            return false;
        }

        try {
            api.removeForAll.invoke(npc.get());
            api.removeNpc.invoke(api.npcManager(), npc.get());
            owners.remove(handle.id());
            return true;
        } catch (Throwable failure) {
            plugin.getLogger().warning("FancyNPCs could not remove an NPC: " + failure);
            return false;
        }
    }

    @Override
    public boolean exists(NpcHandle handle) {
        return npc(handle).isPresent();
    }

    /**
     * Always empty: these NPCs are packets and have no entity to click.
     *
     * Stated explicitly rather than left to a default, because a caller treating empty as "not one
     * of ours" would be wrong in a way that only appears on servers running FancyNPCs.
     */
    @Override
    public Optional<NpcHandle> identify(Entity entity) {
        return Optional.empty();
    }

    @Override
    public Optional<String> definitionOf(NpcHandle handle) {
        return handle.isFrom(NAME) ? decode(handle.id(), 1) : Optional.empty();
    }

    @Override
    public Optional<String> ownerOf(NpcHandle handle) {
        if (!handle.isFrom(NAME)) {
            return Optional.empty();
        }

        String cached = owners.get(handle.id());

        // The cache is a shortcut, not the authority: after a restart it is empty and the id still
        // answers, which is exactly why the owner is encoded into it.
        return cached != null ? Optional.of(cached) : decode(handle.id(), 2);
    }

    @Override
    public int removeAllOwnedBy(String owner) {
        int removed = 0;

        try {
            Object manager = api.npcManager();

            // Copied before removing: removeNpc mutates the manager's own collection.
            List<Object> all = new ArrayList<>((Collection<?>) api.getAllNpcs.invoke(manager));

            for (Object npc : all) {
                String id = idOf(npc);

                if (id == null || !id.startsWith(PREFIX + SEPARATOR)) {
                    continue;
                }

                if (decode(id, 2).filter(owner::equals).isPresent()) {
                    api.removeForAll.invoke(npc);
                    api.removeNpc.invoke(manager, npc);
                    owners.remove(id);
                    removed++;
                }
            }
        } catch (Throwable failure) {
            plugin.getLogger().warning("FancyNPCs cleanup for \"" + owner + "\" failed: " + failure);
        }

        return removed;
    }

    @Override
    public void shutdown() {
        try {
            api.saveNpcs.invoke(api.npcManager(), false);
        } catch (Throwable failure) {
            plugin.getLogger().warning("Could not save FancyNPCs state: " + failure);
        }
    }

    private Optional<Object> npc(NpcHandle handle) {
        if (!handle.isFrom(NAME)) {
            return Optional.empty();
        }

        try {
            return Optional.ofNullable(api.getNpcById.invoke(api.npcManager(), handle.id()));
        } catch (Throwable unavailable) {
            return Optional.empty();
        }
    }

    private String idOf(Object npc) {
        try {
            return (String) api.getId.invoke(api.getData.invoke(npc));
        } catch (Throwable unreadable) {
            return null;
        }
    }

    // ─── Id encoding ──────────────────────────────────────────────────────────────────────────

    /**
     * Builds an id carrying the definition and the owner.
     *
     * FancyNPCs identifies NPCs by a string chosen at creation and offers nowhere durable to hang
     * arbitrary values, so everything this plugin needs to recover is encoded here. The separator is
     * a character neither field can contain — definition ids are lowercase letters, digits and
     * underscores, workspace ids are UUIDs — so a split never lands mid-field.
     */
    private static String encode(String definitionId, String owner) {
        return PREFIX + SEPARATOR + definitionId + SEPARATOR + owner
                + SEPARATOR + UUID.randomUUID().toString().substring(0, 8);
    }

    /** Reads one field back. Empty for an id this plugin did not write. */
    private static Optional<String> decode(String id, int field) {
        String[] parts = id.split("\\" + SEPARATOR);

        if (parts.length < 3 || !PREFIX.equals(parts[0]) || field >= parts.length) {
            return Optional.empty();
        }

        return Optional.of(parts[field]);
    }

    // ─── Resolved API ─────────────────────────────────────────────────────────────────────────

    /**
     * Every FancyNPCs method this provider uses, looked up once.
     *
     * Resolution failure throws out of {@link #resolve}, which is caught at construction — so a
     * FancyNPCs release that renames something disables this backend at boot with the offending
     * member named, and the server falls back to Citizens or the builtin.
     */
    private record Api(
            Method pluginGet,
            Method getNpcManager,
            Method getNpcAdapter,
            Constructor<?> npcDataConstructor,
            Method setDisplayName,
            Method setType,
            Method setGlowing,
            Method setTurnToPlayer,
            Method setCollidable,
            Method setShowInTab,
            Method setOnClick,
            Method create,
            Method spawnForAll,
            Method removeForAll,
            Method registerNpc,
            Method removeNpc,
            Method getNpcById,
            Method getAllNpcs,
            Method saveNpcs,
            Method getData,
            Method getId
    ) {

        static Api resolve() throws ReflectiveOperationException {
            Class<?> pluginClass = Class.forName("de.oliver.fancynpcs.api.FancyNpcsPlugin");
            Class<?> npcClass = Class.forName("de.oliver.fancynpcs.api.Npc");
            Class<?> dataClass = Class.forName("de.oliver.fancynpcs.api.NpcData");
            Class<?> managerClass = Class.forName("de.oliver.fancynpcs.api.NpcManager");

            return new Api(
                    pluginClass.getMethod("get"),
                    pluginClass.getMethod("getNpcManager"),
                    pluginClass.getMethod("getNpcAdapter"),
                    dataClass.getConstructor(String.class, UUID.class, Location.class),
                    dataClass.getMethod("setDisplayName", String.class),
                    dataClass.getMethod("setType", org.bukkit.entity.EntityType.class),
                    dataClass.getMethod("setGlowing", boolean.class),
                    dataClass.getMethod("setTurnToPlayer", boolean.class),
                    dataClass.getMethod("setCollidable", boolean.class),
                    dataClass.getMethod("setShowInTab", boolean.class),
                    dataClass.getMethod("setOnClick", Consumer.class),
                    npcClass.getMethod("create"),
                    npcClass.getMethod("spawnForAll"),
                    npcClass.getMethod("removeForAll"),
                    managerClass.getMethod("registerNpc", npcClass),
                    managerClass.getMethod("removeNpc", npcClass),
                    managerClass.getMethod("getNpcById", String.class),
                    managerClass.getMethod("getAllNpcs"),
                    managerClass.getMethod("saveNpcs", boolean.class),
                    npcClass.getMethod("getData"),
                    dataClass.getMethod("getId"));
        }

        /** The singleton, fetched each time rather than cached — it changes across a plugin reload. */
        Object instance() throws ReflectiveOperationException {
            return pluginGet.invoke(null);
        }

        Object npcManager() throws ReflectiveOperationException {
            return getNpcManager.invoke(instance());
        }

        Object npcAdapter() throws ReflectiveOperationException {
            return getNpcAdapter.invoke(instance());
        }
    }
}
