package org.robtic.jobs.npc;

import org.bukkit.Location;
import org.bukkit.entity.Entity;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.npc.providers.BuiltinNpcProvider;
import org.robtic.jobs.npc.providers.CitizensNpcProvider;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Chooses an NPC backend and routes every call to it.
 *
 * <h2>Selection</h2>
 *
 * <pre>
 *   auto        Citizens, then builtin — first one usable wins
 *   citizens    Citizens, falling back to builtin
 *   builtin     always the plain-entity implementation
 * </pre>
 *
 * Citizens is preferred in {@code auto} because it is the one most servers already run. The builtin
 * is last and always available, which is what stops Citizens being a prerequisite.
 *
 * <h2>FancyNPCs was a third backend and has been removed</h2>
 *
 * It was reached entirely through reflection against {@code de.oliver.fancynpcs.api}, because that
 * artifact is not resolvable at build time — so it was a backend nothing could compile against, that
 * broke silently whenever FancyNPCs renamed a method, and that this server does not run. Removing it
 * takes a whole class of "why is my NPC missing" out of the system.
 *
 * A server that still has FancyNPCs NPCs from an older install is unaffected in the way that
 * matters: this plugin never knew how to identify them as its own anyway, and the handles it stored
 * name their backend, so they are simply not recognised rather than mis-handled.
 *
 * A configured backend that is not installed <em>falls back</em> rather than disabling NPCs. An
 * operator who names Citizens and has not installed it has made a mistake in the config; taking
 * every recruiter off the server is not a proportionate response to it, and the warning says
 * exactly what happened.
 *
 * <h2>Every handle knows which backend made it</h2>
 *
 * Old handles are not silently dropped when a backend changes. {@link #remove} and {@link #exists}
 * try the active provider first and then every other one, so switching backends still cleans up the
 * NPCs the previous one left — which is otherwise a pile of undeletable villagers.
 */
public final class NpcBackend {

    private final Plugin plugin;

    /** The one that spawns. */
    private final NpcProvider active;

    /** Every provider that could be constructed, for cleaning up handles the active one did not make. */
    private final List<NpcProvider> all;

    private NpcBackend(Plugin plugin, NpcProvider active, List<NpcProvider> all) {
        this.plugin = plugin;
        this.active = active;
        this.all = List.copyOf(all);
    }

    /**
     * Builds the backend named in config, falling back as described above.
     *
     * @param preference {@code auto}, {@code citizens} or {@code builtin}
     */
    public static NpcBackend create(Plugin plugin, String preference) {
        String wanted = preference == null ? "auto" : preference.trim().toLowerCase(Locale.ROOT);

        List<NpcProvider> available = new ArrayList<>();

        CitizensNpcProvider.createIfPresent(plugin).ifPresent(available::add);

        // Always constructed, and always last. It is the reason Citizens is not required.
        BuiltinNpcProvider builtin = new BuiltinNpcProvider(plugin);
        available.add(builtin);

        NpcProvider chosen = switch (wanted) {
            case "citizens" -> named(available, CitizensNpcProvider.NAME, builtin, plugin, wanted);
            case "builtin", "internal", "none" -> builtin;
            default -> {
                // "fancynpcs" is named explicitly so a config left over from when that backend
                // existed says what happened, rather than falling into the generic unknown-value
                // branch and reading like a typo.
                if (wanted.equals("fancynpcs") || wanted.equals("fancy")) {
                    plugin.getLogger().warning("npc.yml asks for the \"fancynpcs\" NPC backend, which"
                            + " has been removed. Using auto — set it to \"citizens\" or \"builtin\".");
                } else if (!wanted.equals("auto")) {
                    plugin.getLogger().warning("npc.yml names the unknown backend \"" + wanted
                            + "\". Valid values are auto, citizens, builtin. Using auto.");
                }

                // First usable, in preference order.
                yield available.get(0);
            }
        };

        plugin.getLogger().info("NPC backend: " + chosen.name()
                + (available.size() > 1
                        ? " (also available: " + available.stream()
                                .map(NpcProvider::name)
                                .filter(name -> !name.equals(chosen.name()))
                                .reduce((a, b) -> a + ", " + b).orElse("")+ ")"
                        : ""));

        return new NpcBackend(plugin, chosen, available);
    }

    private static NpcProvider named(
            List<NpcProvider> available,
            String name,
            NpcProvider fallback,
            Plugin plugin,
            String requested
    ) {
        return available.stream()
                .filter(provider -> provider.name().equals(name))
                .findFirst()
                .orElseGet(() -> {
                    plugin.getLogger().warning("npc.yml asks for the \"" + requested
                            + "\" NPC backend, which is not installed. Using \"" + fallback.name()
                            + "\" instead — NPCs will still work.");
                    return fallback;
                });
    }

    /** The provider currently spawning NPCs. */
    public NpcProvider provider() {
        return active;
    }

    public String backendName() {
        return active.name();
    }

    /** Registers the click handler with every provider, not only the active one. */
    public void onInteract(NpcProvider.NpcInteraction handler) {
        all.forEach(provider -> provider.onInteract(handler));
    }

    public Optional<NpcHandle> spawn(NpcDefinition definition, Location location, String owner) {
        return active.spawn(definition, location, owner);
    }

    /**
     * Removes an NPC, trying whichever provider made it.
     *
     * The active one first because that is nearly always the answer, then the others — which is what
     * makes a backend switch clean up after itself instead of stranding NPCs.
     */
    public boolean remove(NpcHandle handle) {
        if (active.remove(handle)) {
            return true;
        }

        for (NpcProvider provider : all) {
            if (provider != active && provider.remove(handle)) {
                return true;
            }
        }

        return false;
    }

    public boolean exists(NpcHandle handle) {
        return all.stream().anyMatch(provider -> provider.exists(handle));
    }

    /**
     * Resolves a clicked entity.
     *
     * Asked of every provider, because a server that switched backends still has the previous one's
     * NPCs standing in old workspaces and clicking one should still work.
     */
    public Optional<NpcHandle> identify(Entity entity) {
        for (NpcProvider provider : all) {
            Optional<NpcHandle> found = provider.identify(entity);

            if (found.isPresent()) {
                return found;
            }
        }

        return Optional.empty();
    }

    public Optional<String> definitionOf(NpcHandle handle) {
        return forHandle(handle).flatMap(provider -> provider.definitionOf(handle));
    }

    public Optional<String> ownerOf(NpcHandle handle) {
        return forHandle(handle).flatMap(provider -> provider.ownerOf(handle));
    }

    /** Cleans up across every backend, so a switch does not leave the previous one's NPCs behind. */
    public int removeAllOwnedBy(String owner) {
        int removed = 0;

        for (NpcProvider provider : all) {
            removed += provider.removeAllOwnedBy(owner);
        }

        return removed;
    }

    /** The provider whose name matches the handle, whether or not it is the active one. */
    private Optional<NpcProvider> forHandle(NpcHandle handle) {
        return all.stream().filter(provider -> handle.isFrom(provider.name())).findFirst();
    }

    public void shutdown() {
        for (NpcProvider provider : all) {
            try {
                provider.shutdown();
            } catch (RuntimeException failure) {
                plugin.getLogger().warning("The " + provider.name()
                        + " NPC backend failed to shut down cleanly: " + failure.getMessage());
            }
        }
    }
}
