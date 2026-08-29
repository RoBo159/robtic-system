package org.robtic.minecraft.progression.workspace;

import org.bukkit.Location;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.storage.ProgressionStorage;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.UnaryOperator;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Every workspace on the server, held in memory and persisted behind it.
 *
 * <h2>All of them, all the time</h2>
 *
 * Workspaces are consulted on block-break events, so the lookup has to be a memory read. There are
 * hundreds of these at most — a few hundred kilobytes — and loading them lazily would mean a
 * protection check that could not answer until an async load returned, which on a block event means
 * either blocking the tick or letting the block break.
 *
 * <h2>Two indexes, one authority</h2>
 *
 * The map by id is the authority. The by-owner and by-structure indexes are derived from it, and
 * every write updates them for the one workspace it touched. They cannot disagree with the authority
 * — a second authority is how a player ends up owning a workspace that the workspace itself says
 * belongs to somebody else.
 *
 * They used to be rebuilt from scratch on every write. That is O(n) work for a change to one entry,
 * on a path that runs on every deposit and every menu click, and — worse — the rebuild clears both
 * maps before refilling them, so any read landing in that window saw a player owning nothing. A full
 * rebuild now happens only on load, where it is the correct operation.
 *
 * <h2>Fail closed</h2>
 *
 * If the initial load fails, {@link #ready()} stays false and the protection listener denies
 * everyone. An operator noticing that nobody can use their workspace will ask why; nobody notices a
 * stranger quietly dismantling a building until it is gone.
 */
public final class WorkspaceRepository {

    private final Plugin plugin;
    private final Logger logger;
    private final ProgressionStorage storage;

    /** The authority. */
    private final Map<String, Workspace> byId = new ConcurrentHashMap<>();

    /** Derived: owner → workspace ids. */
    private final Map<UUID, Set<String>> byOwner = new ConcurrentHashMap<>();

    /** Derived: structure id → workspace id, so a re-scan knows a building is taken. */
    private final Map<String, String> byStructure = new ConcurrentHashMap<>();

    /** Serialises index maintenance. Reads stay lock-free; only the writers coordinate. */
    private final Object indexLock = new Object();

    private volatile boolean ready;

    public WorkspaceRepository(Plugin plugin, ProgressionStorage storage) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();
        this.storage = storage;
    }

    /** Whether the index is trustworthy. False means "we do not know who owns what". */
    public boolean ready() {
        return ready;
    }

    /**
     * Loads every workspace. Called once at boot, on a worker.
     *
     * @param whenReady run on the main thread once loading has finished, successfully or not
     */
    public void load(Runnable whenReady) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                List<Workspace> loaded = storage.loadWorkspaces();

                synchronized (indexLock) {
                    byId.clear();

                    for (Workspace workspace : loaded) {
                        Workspace clash = byId.put(workspace.id(), workspace);

                        if (clash != null) {
                            // Two records with one id: the later one wins, which is the only choice
                            // available, but it is named. Silently keeping one of two claims is how a
                            // player finds somebody else standing in their building with no
                            // explanation anywhere.
                            logger.warning("Two stored workspaces share the id " + workspace.id()
                                    + " (owners " + clash.owner() + " and " + workspace.owner()
                                    + "). The last one read is the one in use; the other is lost.");
                        }
                    }

                    reindex();
                }

                ready = true;
                logger.info("Loaded " + byId.size() + " workspace(s) from " + storage.describe() + ".");
            } catch (ProgressionStorage.StorageException failure) {
                ready = false;
                logger.warning("Could not load workspaces: " + failure.getMessage()
                        + ". Workspace protection will deny interaction until this succeeds.");
            } catch (RuntimeException unexpected) {
                ready = false;
                logger.log(Level.SEVERE, "Unexpected failure loading workspaces", unexpected);
            }

            plugin.getServer().getScheduler().runTask(plugin, whenReady);
        });
    }

    /** Rebuilds the derived indexes from the authority. Load only; callers hold {@link #indexLock}. */
    private void reindex() {
        byOwner.clear();
        byStructure.clear();

        for (Workspace workspace : byId.values()) {
            index(workspace);
        }
    }

    /** Adds one workspace to the derived indexes. Callers hold {@link #indexLock}. */
    private void index(Workspace workspace) {
        byOwner.computeIfAbsent(workspace.owner(), owner -> ConcurrentHashMap.newKeySet())
                .add(workspace.id());

        if (!workspace.structureId().isBlank()) {
            byStructure.put(workspace.structureId(), workspace.id());
        }
    }

    /**
     * Removes one workspace from the derived indexes. Callers hold {@link #indexLock}.
     *
     * The structure entry is removed only when it still points at this workspace. It could already
     * have been reassigned by a claim on the same building, and blindly removing it would leave that
     * building looking unclaimed to the next scan.
     */
    private void unindex(Workspace workspace) {
        Set<String> owned = byOwner.get(workspace.owner());

        if (owned != null) {
            owned.remove(workspace.id());

            if (owned.isEmpty()) {
                byOwner.remove(workspace.owner(), owned);
            }
        }

        byStructure.remove(workspace.structureId(), workspace.id());
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    public Optional<Workspace> byId(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    public Collection<Workspace> all() {
        return List.copyOf(byId.values());
    }

    public int count() {
        return byId.size();
    }

    public List<Workspace> ownedBy(UUID owner) {
        Set<String> ids = byOwner.get(owner);

        if (ids == null || ids.isEmpty()) {
            return List.of();
        }

        List<Workspace> workspaces = new ArrayList<>(ids.size());
        ids.forEach(id -> byId(id).ifPresent(workspaces::add));

        return workspaces;
    }

    /** A player's workspace for one profession, if they have claimed one. */
    public Optional<Workspace> ownedBy(UUID owner, String professionId) {
        return ownedBy(owner).stream()
                .filter(workspace -> workspace.professionId().equals(professionId))
                .findFirst();
    }

    public boolean structureClaimed(String structureId) {
        return byStructure.containsKey(structureId);
    }

    public Optional<Workspace> byStructure(String structureId) {
        return Optional.ofNullable(byStructure.get(structureId)).flatMap(this::byId);
    }

    /**
     * The workspace covering a location.
     *
     * A linear scan over a few hundred entries, run per protected block event. Cheaper than a
     * spatial index that would have to be rebuilt on every claim; if a server ever holds tens of
     * thousands, this is the one method to replace and nothing else needs to change.
     */
    public Optional<Workspace> at(Location location) {
        if (location == null || location.getWorld() == null) {
            return Optional.empty();
        }

        for (Workspace workspace : byId.values()) {
            if (workspace.covers(location)) {
                return Optional.of(workspace);
            }
        }

        return Optional.empty();
    }

    /** Whether a proposed region would overlap an existing workspace. */
    public boolean overlapsExisting(WorkspaceRegion region) {
        return byId.values().stream().anyMatch(workspace -> workspace.region().overlaps(region));
    }

    // ─── Writing ──────────────────────────────────────────────────────────────────────────────

    /**
     * Registers or replaces a workspace, in memory first and storage after.
     *
     * In-memory first so protection applies from the instant of the claim rather than a network
     * round trip later — the gap between those two is exactly when a bystander is standing next to a
     * freshly claimed building.
     *
     * @param whenPersisted run on the main thread with whether the write actually landed, so a
     *                      caller performing an atomic operation can roll back if it did not
     */
    public void put(Workspace workspace, java.util.function.Consumer<Boolean> whenPersisted) {
        synchronized (indexLock) {
            Workspace previous = byId.put(workspace.id(), workspace);

            // The previous version is unindexed first, so a workspace whose owner or structure
            // changed does not leave the old owner still listing it.
            if (previous != null) {
                unindex(previous);
            }

            index(workspace);
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            boolean saved = true;

            try {
                storage.saveWorkspace(workspace);
            } catch (ProgressionStorage.StorageException failure) {
                saved = false;
                logger.warning("Could not persist workspace " + workspace.id() + ": "
                        + failure.getMessage());
            }

            boolean result = saved;
            plugin.getServer().getScheduler().runTask(plugin, () -> whenPersisted.accept(result));
        });
    }

    /** As {@link #put}, for callers that do not need to know whether the write landed. */
    public void put(Workspace workspace) {
        put(workspace, saved -> {
        });
    }

    /**
     * Applies a change to a workspace and persists it.
     *
     * @return the updated workspace, or empty when there is no workspace with that id
     */
    public Optional<Workspace> mutate(String id, UnaryOperator<Workspace> change) {
        Workspace current = byId.get(id);

        if (current == null) {
            return Optional.empty();
        }

        Workspace next = change.apply(current);

        if (next.equals(current)) {
            return Optional.of(current);
        }

        put(next);
        return Optional.of(next);
    }

    /**
     * Removes a workspace.
     *
     * The in-memory removal happens first so protection stops immediately, matching {@link #put}.
     */
    public void remove(String id) {
        synchronized (indexLock) {
            Workspace removed = byId.remove(id);

            if (removed != null) {
                unindex(removed);
            }
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                storage.deleteWorkspace(id);
            } catch (ProgressionStorage.StorageException failure) {
                logger.warning("Could not delete workspace " + id + ": " + failure.getMessage());
            }
        });
    }

    /**
     * Restores a workspace to a previous state without touching storage.
     *
     * The rollback half of an atomic operation: when a multi-step change fails partway, the caller
     * puts the original back into memory and the persisted copy is already the original. Used only
     * by {@code WorkspaceService}.
     */
    void rollback(Workspace previous) {
        synchronized (indexLock) {
            Workspace current = byId.put(previous.id(), previous);

            if (current != null) {
                unindex(current);
            }

            index(previous);
        }
    }

    /**
     * Saves every workspace synchronously. Shutdown only.
     *
     * One bulk call rather than a loop of single saves. The file backend rewrites its whole index per
     * save, so saving n workspaces one at a time was O(n²) file work on the shutdown path — where the
     * server is already holding the main thread and an operator is watching it hang.
     */
    public void shutdown() {
        List<Workspace> all = List.copyOf(byId.values());

        if (all.isEmpty()) {
            return;
        }

        try {
            storage.saveWorkspaces(all);
        } catch (ProgressionStorage.StorageException failure) {
            logger.warning("Could not save " + all.size() + " workspace(s) during shutdown: "
                    + failure.getMessage());
        }
    }
}
