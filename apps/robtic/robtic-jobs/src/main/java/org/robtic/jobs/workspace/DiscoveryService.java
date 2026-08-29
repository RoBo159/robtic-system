package org.robtic.jobs.workspace;

import org.bukkit.Location;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobCatalog;
import org.robtic.jobs.npc.NpcDefinition;
import org.robtic.jobs.npc.NpcService;
import org.robtic.world.api.MarkerRegistry;
import org.robtic.world.api.MarkerSet;
import org.robtic.world.api.PlacedMarker;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Turns a structure RobticWorld has scanned into a recruitment NPC.
 *
 * <pre>
 *   builder places markers  →  saves the schematic
 *      ↓
 *   BetterStructures generates it
 *      ↓
 *   RobticWorld reads and validates the markers   ← one scan, one owner
 *      ↓  StructureScannedEvent
 *   this service spawns the recruiter             ← what the profession system cares about
 * </pre>
 *
 * <h2>This service no longer scans anything</h2>
 *
 * It used to snapshot every newly generated chunk and sweep it for signs whose text began
 * {@code [robtic]} — a second marker system running alongside RobticWorld's, with a forgeable format
 * and no notion of a structure beyond the one block it found. All of that is gone. RobticWorld owns
 * scanning, identity and validation; this service subscribes to the result and does the one thing
 * that is genuinely this plugin's business, which is knowing what a profession recruiter is.
 *
 * The saving is not only architectural. Chunk scanning happened twice per generated chunk for two
 * formats describing the same thing; it now happens once, in the module that owns it.
 *
 * <h2>What is kept in memory, and what is not</h2>
 *
 * The recruiter index and the scanned marker sets are session caches. Neither needs persisting: a
 * recruiter is recoverable from its own NPC tags — see {@link #recover} — and a claimed workspace
 * stores its own region, so the marker set has done its job by the time anyone would miss it.
 */
public final class DiscoveryService {

    private final Plugin plugin;
    private final JobCatalog jobs;
    private final NpcService npcs;
    private final WorkspaceService workspaces;

    /**
     * Recruiter NPC → the marker it came from.
     *
     * Rebuilt from the NPC when it is missing, so a recruiter that outlived a restart still works.
     */
    private final Map<org.robtic.jobs.npc.NpcHandle, StructureMarker> recruiters =
            new ConcurrentHashMap<>();

    /**
     * Structure id → the markers RobticWorld found in it.
     *
     * Held so a claim can use the region the builder actually marked out rather than a radius from a
     * config file. That is the whole reason the origin and end markers exist, and reading it from
     * here is what turns them from a validation rule into the thing that decides what a player owns.
     */
    private final Map<String, MarkerSet> scanned = new ConcurrentHashMap<>();

    /** Whether discovery runs at all. Off disables the whole exploration path without unwiring it. */
    private volatile boolean enabled = true;

    /** Worlds discovery is allowed in. Empty means all of them. */
    private volatile Set<String> worlds = Set.of();

    public DiscoveryService(Plugin plugin, JobCatalog jobs, NpcService npcs, WorkspaceService workspaces) {
        this.plugin = plugin;
        this.jobs = jobs;
        this.npcs = npcs;
        this.workspaces = workspaces;
    }

    public void configure(boolean enabled, Set<String> worlds) {
        this.enabled = enabled;
        this.worlds = Set.copyOf(worlds);
    }

    public boolean enabled() {
        return enabled;
    }

    // ─── Adoption ─────────────────────────────────────────────────────────────────────────────

    /**
     * Takes on a structure RobticWorld has just read.
     *
     * <h2>Idempotent, because the event is</h2>
     *
     * RobticWorld announces a structure once per session, but an admin rescan can announce the same
     * one again and a listener is told to expect it. Adoption is therefore keyed on the structure id
     * throughout: an already-claimed structure is skipped, and a structure that already has its
     * recruiter standing is not given a second one.
     *
     * @param registry RobticWorld's registry, needed to resolve the recruiter role — a placed marker
     *                 deliberately knows nothing about its own type
     */
    public void adopt(MarkerSet set, MarkerRegistry registry) {
        if (!enabled) {
            return;
        }

        if (!worlds.isEmpty() && !worlds.contains(set.region().world())) {
            return;
        }

        // Kept whatever happens next. Even a structure nobody can claim today has a region, and the
        // moment its job is added to jobs.yml an admin rescan should not be needed to place it.
        scanned.put(set.structureId(), set);

        if (workspaces.repository().structureClaimed(set.structureId())) {
            // Already somebody's. The recruiter's work is done and the workspace's own NPCs are
            // staffed by WorkspaceService.
            return;
        }

        if (recruiters.values().stream()
                .anyMatch(known -> known.structureId().equals(set.structureId()))) {
            return;
        }

        // Every recruiter, not the first. A guild hall that offers three professions has three, and
        // taking only one would spawn a single NPC and silently drop the rest — after which the
        // marker blocks are cleared and there is nothing left to recover them from.
        List<PlacedMarker> placed = set.allByRole(registry, recruiterRoles);

        if (placed.isEmpty()) {
            // A structure with no recruiter is perfectly legitimate — a dungeon, an event building,
            // anything else that listens for the same event. Not this plugin's concern.
            return;
        }

        for (PlacedMarker marker : placed) {
            Optional<StructureMarker> recruiter = StructureMarker.fromRecruiter(marker, set);

            if (recruiter.isEmpty()) {
                plugin.getLogger().warning("The structure " + set.structureId() + " has a recruiter"
                        + " marker at " + marker.point().describe() + " with no \"job\" metadata, so"
                        + " nothing knows which profession it offers. Place the marker, look at it,"
                        + " and run \"/structure marker set job <profession>\".");
                continue;
            }

            spawnRecruiter(recruiter.get());
        }
    }

    /**
     * The NPC roles that mean "recruiter".
     *
     * Matched against {@code markers.yml → types → … → npc-role}. Roles rather than marker type ids,
     * and a configurable set rather than one name, so the shipped {@code job_recruiter} and
     * {@code rare_recruiter} are both picked up and a server that invents a third needs no code
     * change — only its role listed in {@code jobs.yml}.
     */
    private volatile Set<String> recruiterRoles = DEFAULT_RECRUITER_ROLES;

    /** What {@code markers.yml} ships with. */
    public static final Set<String> DEFAULT_RECRUITER_ROLES = Set.of("recruiter", "recruiter_rare");

    /** Replaces the recruiter roles after a config reload. Empty restores the shipped set. */
    public void recruiterRoles(Set<String> roles) {
        this.recruiterRoles = roles == null || roles.isEmpty()
                ? DEFAULT_RECRUITER_ROLES
                : Set.copyOf(roles);
    }

    /**
     * Spawns the recruiter a marker describes.
     *
     * Every refusal below leaves the structure in the index rather than dropping it, so fixing the
     * configuration and running an admin rescan is enough to place the NPC. The marker blocks are
     * already gone by this point — RobticWorld clears them after the event — so there is nothing left
     * in the world to retry against, and the index is the only record.
     */
    /**
     * Places a recruiter for a building that has just been abandoned.
     *
     * <h2>Not the same path as adoption, deliberately</h2>
     *
     * {@link #adopt} starts from markers RobticWorld found in a freshly generated structure. This
     * starts from a building that has been standing for months, whose marker blocks were consumed
     * the day it was first scanned and cannot be read again. All that is left — and all that is
     * needed — is where it stands and which trade it should now offer.
     *
     * The structure keeps its id, so the building remains the same building: a claim on it still
     * refuses if something else already owns it, and the recruiter is still cleared by structure id
     * when somebody takes it.
     *
     * @return false when the profession is unknown, its recruiter NPC is undefined, or the world is
     *         not loaded. The caller decides what to do about it; nothing here is retried
     */
    public boolean placeRecruiter(String professionId, String structureId,
                                  org.robtic.core.geometry.WorldPoint anchor) {
        // Any recruiter still standing from before is cleared first. An abandoned building that
        // somehow kept one would otherwise end up offering two trades at once.
        clearRecruitersAt(structureId);

        return spawnRecruiter(new StructureMarker(
                professionId, structureId, anchor, anchor, 0f, Map.of()));
    }

    private boolean spawnRecruiter(StructureMarker marker) {
        Optional<Job> job = jobs.job(marker.jobId());

        if (job.isEmpty()) {
            plugin.getLogger().warning("The structure " + marker.structureId()
                    + " offers the unknown profession \"" + marker.jobId()
                    + "\". Check that jobs.yml defines it.");
            return false;
        }

        Optional<NpcDefinition> definition = npcs.definition(job.get().recruiter());

        if (definition.isEmpty()) {
            plugin.getLogger().warning("The profession \"" + job.get().id() + "\" names the recruiter"
                    + " NPC \"" + job.get().recruiter() + "\", which npc.yml does not define.");
            return false;
        }

        Optional<Location> spawn = marker.spawn().toLocation();

        if (spawn.isEmpty()) {
            // The world unloaded between the scan and here. The structure stays indexed, so a rescan
            // once it is loaded again places the recruiter.
            return false;
        }

        Optional<org.robtic.jobs.npc.NpcHandle> handle =
                npcs.spawn(definition.get(), spawn.get(), marker.structureId());

        if (handle.isEmpty()) {
            // Every backend reports a failed spawn rather than throwing, so this is a normal outcome
            // — a chunk that unloaded, a Citizens registry that refused. Said once, at WARNING,
            // because a guild hall with no recruiter looks perfectly fine and nobody finds out
            // otherwise until a player walks up to it.
            plugin.getLogger().warning("Could not spawn the " + job.get().id() + " recruiter at "
                    + marker.spawn().describe() + ". The structure is registered, so \"/structure"
                    + " marker scan\" nearby will try again.");
            return false;
        }

        recruiters.put(handle.get(), marker);

        plugin.getLogger().fine("Spawned a " + job.get().id() + " recruiter at "
                + marker.spawn().describe() + " for structure " + marker.structureId() + ".");

        return true;
    }

    // ─── Regions ──────────────────────────────────────────────────────────────────────────────

    /**
     * The area a builder marked out for a structure.
     *
     * This is what the origin and end markers are <em>for</em>. A claim that used a radius instead
     * protected a box centred on wherever the recruiter happened to stand — which is not the building
     * unless the recruiter is at its centre, and is never its shape.
     *
     * @return empty when the structure was not scanned this session, in which case the caller falls
     *         back to the configured radius rather than refusing the claim
     */
    public Optional<WorkspaceRegion> regionOf(String structureId) {
        return Optional.ofNullable(scanned.get(structureId))
                .map(set -> new WorkspaceRegion(
                        set.region().world(),
                        set.region().minX(), set.region().minY(), set.region().minZ(),
                        set.region().maxX(), set.region().maxY(), set.region().maxZ()));
    }

    /** The markers found in a structure, for whatever wants to place something at one. */
    public Optional<MarkerSet> markersOf(String structureId) {
        return Optional.ofNullable(scanned.get(structureId));
    }

    // ─── Recruiters ───────────────────────────────────────────────────────────────────────────

    /**
     * The marker a recruiter came from.
     *
     * Answered from this session's index when it can be, and rebuilt from the NPC itself when it
     * cannot — see {@link #recover}. The two together mean a recruiter is usable whether or not the
     * server has restarted since it was spawned.
     */
    public Optional<StructureMarker> markerOf(org.robtic.jobs.npc.NpcHandle handle) {
        StructureMarker known = recruiters.get(handle);

        return known != null ? Optional.of(known) : recover(handle);
    }

    /**
     * Rebuilds a marker from the NPC that came from it.
     *
     * <h2>Why this has to exist</h2>
     *
     * The index is memory-only, and the marker blocks are cleared the instant they are read —
     * precisely so players never see them. So after a restart the world holds a recruiter and no
     * record of what it offers, the structure is not rescanned because its markers are gone, and the
     * only response to a click was to delete the NPC — which left the building permanently
     * unclaimable, having consumed its markers.
     *
     * Nothing new needs storing to fix that. Both facts are already on the NPC: it was spawned tagged
     * with its structure id, and that id encodes the region's lower corner, while the NPC definition
     * names the job. A recovered marker has no region — {@link #regionOf} returns empty for it and
     * the claim falls back to the configured radius, which is the pre-marker behaviour and is the
     * right thing to degrade to.
     */
    private Optional<StructureMarker> recover(org.robtic.jobs.npc.NpcHandle handle) {
        Optional<String> structureId = npcs.ownerOf(handle);
        Optional<NpcDefinition> definition = npcs.definitionOf(handle);

        if (structureId.isEmpty() || definition.isEmpty() || definition.get().jobId().isBlank()) {
            return Optional.empty();
        }

        Optional<org.robtic.core.geometry.WorldPoint> anchor =
                StructureMarker.anchorOf(structureId.get());

        if (anchor.isEmpty()) {
            return Optional.empty();
        }

        StructureMarker marker = new StructureMarker(
                definition.get().jobId(), structureId.get(), anchor.get(), anchor.get(), 0f, Map.of());

        // Remembered, so the next click on this recruiter is an ordinary map read.
        recruiters.put(handle, marker);

        plugin.getLogger().fine("Recovered the " + marker.jobId() + " recruiter at "
                + marker.anchor().describe() + " from its own tags.");

        return Optional.of(marker);
    }

    /**
     * Removes every recruiter at a structure and forgets them.
     *
     * The multi-profession case: a rare guild hall offers several jobs, a player picks one, and the
     * rest disappear. Keyed on structure id rather than proximity, so two guild halls built next to
     * each other cannot clear each other's NPCs.
     */
    public void clearRecruitersAt(String structureId) {
        recruiters.entrySet().removeIf(entry -> {
            if (!entry.getValue().structureId().equals(structureId)) {
                return false;
            }

            npcs.remove(entry.getKey());
            return true;
        });

        // Also sweeps any this map lost track of — one that survived a restart, say. Without it a
        // stale recruiter would stand in a claimed building offering a job forever.
        npcs.removeAllOwnedBy(structureId);
    }

    /** Forgets a single recruiter, for one that turned out to be stale. */
    public void forgetRecruiter(org.robtic.jobs.npc.NpcHandle handle) {
        recruiters.remove(handle);
    }

    /** Drops the in-memory indexes. Called on disable. */
    public void clear() {
        recruiters.clear();
        scanned.clear();
    }
}
