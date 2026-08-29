package org.robtic.minecraft.progression.npc;

import java.util.Optional;
import java.util.UUID;

/**
 * A reference to a spawned NPC that survives restarts, whichever backend created it.
 *
 * <h2>Why not just a UUID</h2>
 *
 * The three backends identify NPCs differently and only one of them uses an entity UUID:
 *
 * <pre>
 *   builtin     the entity's own UUID
 *   Citizens    the NPC's registry UUID, which is not the entity's
 *   FancyNPCs   a string id chosen at creation; there is no stable UUID at all
 * </pre>
 *
 * Storing a UUID would therefore make FancyNPCs unrepresentable and would silently break if an
 * operator switched backends — the stored id would look valid and resolve to nothing. Carrying the
 * backend name alongside an opaque string means a handle written by one backend is recognisably not
 * another's, so a switch degrades to "that NPC is gone, spawn a new one" instead of to confusion.
 *
 * @param backend which provider created it, e.g. {@code citizens}
 * @param id      that provider's own identifier, opaque to everything else
 */
public record NpcHandle(String backend, String id) {

    public NpcHandle {
        backend = backend == null ? "" : backend.toLowerCase(java.util.Locale.ROOT);
        id = id == null ? "" : id;
    }

    public static NpcHandle of(String backend, String id) {
        return new NpcHandle(backend, id);
    }

    public static NpcHandle of(String backend, UUID id) {
        return new NpcHandle(backend, id.toString());
    }

    /** The id as a UUID, for backends that use one. Empty when it is not one. */
    public Optional<UUID> asUuid() {
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException notAUuid) {
            return Optional.empty();
        }
    }

    public boolean isFrom(String backendName) {
        return backend.equalsIgnoreCase(backendName);
    }

    public boolean valid() {
        return !backend.isBlank() && !id.isBlank();
    }

    /** Serialised as {@code backend:id}, which is what is stored. */
    public String serialise() {
        return backend + ":" + id;
    }

    /** @return empty when the stored text is not a handle, so old or corrupt data is skipped */
    public static Optional<NpcHandle> parse(String stored) {
        if (stored == null || stored.isBlank()) {
            return Optional.empty();
        }

        int split = stored.indexOf(':');

        if (split <= 0 || split == stored.length() - 1) {
            return Optional.empty();
        }

        return Optional.of(new NpcHandle(stored.substring(0, split), stored.substring(split + 1)));
    }
}
