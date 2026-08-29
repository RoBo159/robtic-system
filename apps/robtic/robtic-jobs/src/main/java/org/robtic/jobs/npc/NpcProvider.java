package org.robtic.jobs.npc;

import org.bukkit.Location;
import org.bukkit.entity.Entity;

import java.util.Optional;

/**
 * Spawns and removes NPCs through one particular backend.
 *
 * <h2>Three implementations, chosen at boot</h2>
 *
 * <pre>
  *   CitizensProvider    the long-standing option, and what most operators already run
 *   BuiltinNpcProvider  plain Paper entities; works with nothing installed at all
 * </pre>
 *
 * The builtin exists so this system has no hard dependency on either plugin. A server that installs
 * neither still gets working recruiters and sellers; a server that later installs Citizens gets
 * better ones without any of this code changing.
 *
 * <h2>Isolation</h2>
 *
 * Each implementation is the only class in the plugin that mentions its backend's types, and is
 * constructed behind a plugin-presence check. That is what keeps the JVM from resolving Citizens
 * classes on a server without Citizens — the same arrangement {@code LuckPermsTitleDisplay} uses.
 *
 * <h2>Contract</h2>
 *
 * Every method runs on the main thread and must not throw. A backend failure returns empty or false;
 * the caller degrades — a missing NPC is a nuisance, an exception during a chunk load is an outage.
 */
public interface NpcProvider {

    /** Lowercase backend name, stored in every {@link NpcHandle} this provider issues. */
    String name();

    /** Whether the backing plugin is present and its API usable right now. */
    boolean available();

    /**
     * Creates an NPC.
     *
     * @param definition what it looks like and what kind it is
     * @param location   where it stands; the world must be loaded
     * @param owner      an opaque tag tying it to whatever created it — a workspace id, or a
     *                   structure id — so it can be found and removed again without a lookup table
     * @return a handle, or empty when the spawn failed for any reason
     */
    Optional<NpcHandle> spawn(NpcDefinition definition, Location location, String owner);

    /**
     * Removes an NPC.
     *
     * @return whether anything was removed. False for a handle from another backend, or one whose
     *         NPC is already gone — both of which are ordinary rather than errors
     */
    boolean remove(NpcHandle handle);

    /** Whether this NPC still exists. Used to detect the ones a crash or a rollback removed. */
    boolean exists(NpcHandle handle);

    /**
     * Resolves a clicked entity to one of this provider's NPCs.
     *
     * A packet-based backend has no entity to click, so such an implementation always returns
     * empty and it delivers clicks through its own callback instead. Callers must therefore not
     * treat "no entity matched" as "not an NPC".
     */
    Optional<NpcHandle> identify(Entity entity);

    /** The definition id this NPC was spawned from, when the backend can still tell. */
    Optional<String> definitionOf(NpcHandle handle);

    /** The owner tag passed at spawn. */
    Optional<String> ownerOf(NpcHandle handle);

    /**
     * Removes every NPC this provider owns for a tag.
     *
     * The recovery path for NPCs that outlived their record: one left by a failed claim, or
     * duplicated by a world rollback. Without it those are unremovable except by hand.
     */
    int removeAllOwnedBy(String owner);

    /**
     * Registers what happens when one of this provider's NPCs is right-clicked.
     *
     * A callback rather than each provider raising a Bukkit event, because a provider may deliver clicks
     * through a per-NPC consumer and has no event to listen for. Normalising here means the
     * interaction logic is written once against a handle and a player, whichever backend is running.
     */
    void onInteract(NpcInteraction handler);

    /** Releases anything the provider holds. Called on disable. */
    default void shutdown() {
    }

    /** What to run when an NPC is clicked. */
    @FunctionalInterface
    interface NpcInteraction {
        void accept(org.bukkit.entity.Player player, NpcHandle handle);
    }
}
