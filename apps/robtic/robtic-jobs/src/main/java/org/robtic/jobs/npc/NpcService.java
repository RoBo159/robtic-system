package org.robtic.jobs.npc;

import org.bukkit.Location;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.plugin.Plugin;
import org.robtic.core.registry.Registry;

import java.util.Optional;
import java.util.logging.Logger;

/**
 * The NPC definitions, and the one door to whichever backend is spawning them.
 *
 * <h2>Definitions here, mechanics in the backend</h2>
 *
 * This class owns {@code npc.yml} — what NPCs exist, what they look like, what kind each one is.
 * {@link NpcBackend} owns how one is actually put into the world, which is different for Citizens,
 * and the builtin implementation. Nothing above this line knows which of the two is
 * running.
 *
 * That split is what let a third backend be added without touching the workspace, discovery or
 * interaction code: they all deal in {@link NpcDefinition} and {@link NpcHandle}.
 */
public final class NpcService {

    private final Plugin plugin;
    private final Logger logger;
    private final Registry<NpcDefinition> definitions;
    private final NpcBackend backend;

    public NpcService(Plugin plugin, NpcBackend backend) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.definitions = new Registry<>("npc", plugin.getLogger());
        this.backend = backend;
    }

    public NpcBackend backend() {
        return backend;
    }

    public Registry<NpcDefinition> definitions() {
        return definitions;
    }

    public Optional<NpcDefinition> definition(String id) {
        return definitions.find(id);
    }

    /** Registers what happens when any of this plugin's NPCs is right-clicked, on every backend. */
    public void onInteract(NpcProvider.NpcInteraction handler) {
        backend.onInteract(handler);
    }

    public void load(ConfigurationSection root) {
        definitions.clear();

        if (root == null) {
            logger.warning("npc.yml is empty or unreadable — no NPCs were loaded.");
            return;
        }

        ConfigurationSection section = root.getConfigurationSection("npcs");

        if (section == null) {
            logger.warning("npc.yml has no \"npcs\" section.");
            return;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body != null) {
                NpcDefinition.parse(key, body, logger).ifPresent(definitions::register);
            }
        }

        logger.info("Loaded " + definitions.size() + " NPC definition(s).");
    }

    // ─── Spawning and removal ─────────────────────────────────────────────────────────────────

    /**
     * Spawns an NPC.
     *
     * @param owner an opaque tag tying it to whatever created it — a workspace id, or a structure id
     * @return a handle to store, or empty when the spawn failed
     */
    public Optional<NpcHandle> spawn(NpcDefinition definition, Location location, String owner) {
        return backend.spawn(definition, location, owner);
    }

    /** Spawns by definition id, warning when the definition does not exist. */
    public Optional<NpcHandle> spawn(String definitionId, Location location, String owner) {
        Optional<NpcDefinition> definition = definitions.find(definitionId);

        if (definition.isEmpty()) {
            logger.warning("Something tried to spawn the unknown NPC \"" + definitionId
                    + "\". Check that npc.yml defines it.");
            return Optional.empty();
        }

        return spawn(definition.get(), location, owner);
    }

    public boolean remove(NpcHandle handle) {
        return backend.remove(handle);
    }

    /** Whether this NPC is still in the world. Detects ones a crash or a rollback removed. */
    public boolean exists(NpcHandle handle) {
        return backend.exists(handle);
    }

    /** Resolves a clicked entity. Empty for a backend with no entity — see {@link NpcProvider#identify}. */
    public Optional<NpcHandle> identify(Entity entity) {
        return backend.identify(entity);
    }

    /** The definition an NPC was spawned from, when it still exists in the configuration. */
    public Optional<NpcDefinition> definitionOf(NpcHandle handle) {
        return backend.definitionOf(handle).flatMap(definitions::find);
    }

    /**
     * The definition id, even when no definition matches it any more.
     *
     * Used by cleanup: an NPC whose definition was deleted from the config is still an NPC and still
     * has to be removable, which {@link #definitionOf} cannot express because it returns empty for
     * exactly that case.
     */
    public Optional<String> rawDefinitionOf(NpcHandle handle) {
        return backend.definitionOf(handle);
    }

    public Optional<String> ownerOf(NpcHandle handle) {
        return backend.ownerOf(handle);
    }

    /**
     * Removes every NPC belonging to one owner, across every backend.
     *
     * The recovery path for NPCs that outlived their record — one left by a failed claim, one
     * duplicated by a rollback, or one spawned by a backend the server has since switched away from.
     */
    public int removeAllOwnedBy(String owner) {
        return backend.removeAllOwnedBy(owner);
    }

    public void shutdown() {
        backend.shutdown();
    }

    /** Whether an entity type can be used as an NPC, for validating config outside this class. */
    public static boolean spawnable(EntityType type) {
        return type != EntityType.PLAYER
                && type.getEntityClass() != null
                && LivingEntity.class.isAssignableFrom(type.getEntityClass());
    }
}
