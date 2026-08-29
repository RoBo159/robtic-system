package org.robtic.minecraft.progression.workspace;

import org.bukkit.Chunk;
import org.bukkit.ChunkSnapshot;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.jobs.Job;
import org.robtic.minecraft.progression.jobs.JobCatalog;
import org.robtic.minecraft.progression.npc.NpcDefinition;
import org.robtic.minecraft.progression.npc.NpcService;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * Finds profession markers in generated structures and turns them into recruitment NPCs.
 *
 * <pre>
 *   BetterStructures generates a structure
 *      ↓  chunk loads
 *   snapshot taken on the main thread, scanned on a worker
 *      ↓  candidate positions
 *   marker read on the main thread, NPC spawned, marker block deleted
 * </pre>
 *
 * <h2>The cost, and why it is shaped this way</h2>
 *
 * A chunk is 16 × 16 × 384 — about 98,000 blocks. Reading every one of them through the Bukkit API
 * on the main thread, for every chunk that loads, would be a measurable freeze on a busy server and
 * a guaranteed one during world generation. That is the "no synchronous heavy scanning" requirement,
 * and it is not a small effect: a player flying at speed loads dozens of chunks a second.
 *
 * Three things bring it down to nothing:
 *
 * <ul>
 *   <li><b>Only newly generated chunks.</b> Markers arrive with the structure. A chunk that has
 *       loaded before has already been scanned, so the ordinary case — players moving through
 *       explored terrain — costs one boolean.</li>
 *   <li><b>A bounded scan.</b> Empty sections are skipped whole and each column stops at the terrain
 *       surface, so the read is proportional to the ground that exists rather than to the height of
 *       the world. See {@link #findCandidates}, which also explains why the palette pre-check this
 *       once used was unsound.</li>
 *   <li><b>Off the main thread.</b> The snapshot is taken synchronously — it must be — and every
 *       block read happens on a worker against that immutable copy.</li>
 * </ul>
 *
 * <h2>Duplicate protection</h2>
 *
 * A chunk can load, unload and reload while the scan of it is still in flight. {@link #scanning}
 * stops the second scan starting, and the marker block being deleted the instant it is read stops a
 * third from finding anything — so a structure produces one recruiter no matter how the chunk is
 * treated.
 */
public final class DiscoveryService {

    private final Plugin plugin;
    private final JobCatalog jobs;
    private final NpcService npcs;
    private final WorkspaceService workspaces;

    /** Chunk keys currently being scanned, so a reload mid-scan cannot start a second one. */
    private final Set<Long> scanning = ConcurrentHashMap.newKeySet();

    /**
     * Recruiter NPC → the marker it came from.
     *
     * A session cache, not a record. Nothing here needs persisting because everything in it can be
     * rebuilt from the NPC — see {@link #recover}, which is what a click on a recruiter that outlived
     * a restart goes through.
     */
    private final java.util.Map<org.robtic.minecraft.progression.npc.NpcHandle, StructureMarker> recruiters =
            new ConcurrentHashMap<>();

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

    /**
     * Examines a chunk for markers.
     *
     * @param newlyGenerated whether this chunk has just been generated. Only new chunks are scanned
     *                       in normal operation — see the class comment
     */
    public void examine(Chunk chunk, boolean newlyGenerated) {
        if (!enabled || !newlyGenerated) {
            return;
        }

        if (!worlds.isEmpty() && !worlds.contains(chunk.getWorld().getName())) {
            return;
        }

        scan(chunk);
    }

    /**
     * Scans a chunk regardless of whether it is new. Admin-triggered rescans only.
     *
     * Exists because the alternative, when a structure is missed, is an operator with no way to
     * recover short of regenerating the world.
     */
    public void rescan(Chunk chunk) {
        scan(chunk);
    }

    private void scan(Chunk chunk) {
        long key = chunk.getChunkKey();

        if (!scanning.add(key)) {
            return;
        }

        World world = chunk.getWorld();
        int minY = world.getMinHeight();
        int maxY = world.getMaxHeight();

        // Taken on the main thread; every read afterwards is against this immutable copy.
        //
        // The height map is included, and must be. Without it the snapshot has no `hmap` and
        // getHighestBlockYAt — which is what bounds the vertical scan — throws on the first call.
        // The scan below caught that as an unexpected failure and gave up, so every chunk that
        // actually contained a marker logged a warning and discovered nothing. Biomes are still
        // excluded because nothing here reads them and they are the expensive part of a snapshot.
        ChunkSnapshot snapshot;

        try {
            snapshot = chunk.getChunkSnapshot(true, false, false);
        } catch (RuntimeException failed) {
            scanning.remove(key);
            plugin.getLogger().fine("Could not snapshot a chunk for marker scanning: " + failed.getMessage());
            return;
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            List<int[]> candidates;

            try {
                candidates = findCandidates(snapshot, minY, maxY);
            } catch (RuntimeException failure) {
                plugin.getLogger().log(Level.WARNING, "Marker scan failed", failure);
                scanning.remove(key);
                return;
            }

            if (candidates.isEmpty()) {
                scanning.remove(key);
                return;
            }

            // Block state and entity spawning are main-thread only, so the actual work returns.
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                try {
                    process(world, chunk, candidates);
                } finally {
                    scanning.remove(key);
                }
            });
        });
    }

    /**
     * Finds every position that might hold a marker. Runs on a worker.
     *
     * <h2>Bounded, not filtered by palette</h2>
     *
     * There used to be a pre-check here that asked {@link ChunkSnapshot#contains} whether the chunk
     * held a sign, and skipped it entirely when the answer was no. That check is unsound:
     * {@code contains} matches an exact block state, and the state it was given was each sign
     * material's default — so a sign placed at any rotation other than zero, on any wall facing other
     * than north, or waterlogged, answered "no" and the structure was silently never discovered. Since
     * BetterStructures pastes signs at whatever rotation the builder saved, that is most of them.
     *
     * Enumerating every state a sign can be in would restore correctness and cost more than it saves:
     * around five hundred palette probes per chunk, against the twenty-odd thousand cheap array reads
     * the scan itself performs. So the scan is simply bounded instead, by two things that are both
     * exact:
     *
     * <ul>
     *   <li>{@link ChunkSnapshot#isSectionEmpty} skips whole sixteen-block sections of air outright,
     *       which is most of a chunk's vertical extent.</li>
     *   <li>{@link ChunkSnapshot#getHighestBlockYAt} stops each column at the terrain surface.</li>
     * </ul>
     *
     * What is left runs on a worker thread, for newly generated chunks only.
     */
    private List<int[]> findCandidates(ChunkSnapshot snapshot, int minY, int maxY) {
        List<int[]> candidates = new ArrayList<>();

        int sections = Math.max(0, (maxY - minY) >> 4);

        if (sections == 0) {
            return candidates;
        }

        boolean[] populated = new boolean[sections];
        boolean any = false;

        for (int section = 0; section < sections; section++) {
            populated[section] = !snapshot.isSectionEmpty(section);
            any |= populated[section];
        }

        if (!any) {
            return candidates;
        }

        for (int x = 0; x < 16; x++) {
            for (int z = 0; z < 16; z++) {
                int highest = Math.min(maxY - 1, snapshot.getHighestBlockYAt(x, z));

                for (int y = minY; y <= highest; y++) {
                    int section = (y - minY) >> 4;

                    if (section < sections && !populated[section]) {
                        // Jump to the last block of this section; the loop's own increment steps past
                        // it. Skipping sixteen levels at a time is what makes the deep-void half of a
                        // modern world's height range free.
                        y = minY + ((section + 1) << 4) - 1;
                        continue;
                    }

                    if (StructureMarker.couldBeMarker(snapshot.getBlockType(x, y, z))) {
                        candidates.add(new int[]{x, y, z});
                    }
                }
            }
        }

        return candidates;
    }

    /**
     * Reads each candidate and turns real markers into NPCs. Main thread.
     *
     * The chunk is re-checked as loaded because it may have unloaded while the worker ran; reading
     * block state from an unloaded chunk would force it back into memory, which is exactly the kind
     * of accidental chunk-loading that makes a plugin a performance problem.
     */
    private void process(World world, Chunk chunk, List<int[]> candidates) {
        if (!chunk.isLoaded()) {
            return;
        }

        int baseX = chunk.getX() << 4;
        int baseZ = chunk.getZ() << 4;

        for (int[] position : candidates) {
            Block block = world.getBlockAt(baseX + position[0], position[1], baseZ + position[2]);

            StructureMarker.read(block).ifPresent(marker -> activate(marker, block));
        }
    }

    /**
     * Spawns the recruiter a marker describes and removes the marker.
     *
     * The marker is deleted whatever happens, including when the job it names does not exist. A
     * marker that stays behind would be re-read on every subsequent scan and would leave a visible
     * sign in the finished building — and if the job is missing, that is a config problem an operator
     * fixes in the config, not something to be retried forever against the world.
     */
    private void activate(StructureMarker marker, Block block) {
        // Cleared before spawning, so a failure part-way cannot leave both a marker and an NPC.
        block.setType(Material.AIR, false);

        if (workspaces.repository().structureClaimed(marker.structureId())) {
            // Already somebody's workspace. The recruiter's job is done, and the workspace's own
            // NPCs are staffed by WorkspaceService.
            return;
        }

        Optional<Job> job = jobs.job(marker.jobId());

        if (job.isEmpty()) {
            plugin.getLogger().warning("A structure marker at " + marker.anchor().describe()
                    + " offers the unknown job \"" + marker.jobId()
                    + "\". Check that jobs.yml defines it.");
            return;
        }

        Optional<NpcDefinition> definition = npcs.definition(job.get().recruiter());

        if (definition.isEmpty()) {
            plugin.getLogger().warning("The job \"" + job.get().id() + "\" names the recruiter NPC \""
                    + job.get().recruiter() + "\", which npc.yml does not define.");
            return;
        }

        Optional<Location> spawn = marker.spawn().toLocation();

        if (spawn.isEmpty()) {
            return;
        }

        npcs.spawn(definition.get(), spawn.get(), marker.structureId()).ifPresent(handle -> {
            // The marker is remembered against the NPC, so a click on it knows which structure it is
            // standing in without having to search for a marker that no longer exists.
            recruiters.put(handle, marker);

            plugin.getLogger().fine("Spawned a " + job.get().id() + " recruiter at "
                    + marker.spawn().describe());
        });
    }

    // ─── Recruiters ───────────────────────────────────────────────────────────────────────────

    /**
     * The marker a recruiter came from.
     *
     * Answered from this session's index when it can be, and rebuilt from the NPC itself when it
     * cannot — see {@link #recover}. The two together mean a recruiter is usable whether or not the
     * server has restarted since it was spawned.
     */
    public Optional<StructureMarker> markerOf(org.robtic.minecraft.progression.npc.NpcHandle handle) {
        StructureMarker known = recruiters.get(handle);

        return known != null ? Optional.of(known) : recover(handle);
    }

    /**
     * Rebuilds a marker from the NPC that came from it.
     *
     * <h2>Why this has to exist</h2>
     *
     * {@link #recruiters} is memory-only, and the reasoning for that was that the world is the source
     * of truth. It is not: the marker sign is destroyed the instant it is read, precisely so players
     * never see it. So after a restart the world holds a recruiter and no record of what it offers,
     * the chunk is not rescanned because it is no longer new, and the only response to a click was to
     * delete the NPC — which left the building permanently unclaimable, having consumed its marker.
     *
     * Nothing new needs storing to fix that. Both facts are already on the NPC: it was spawned tagged
     * with its structure id, and that id encodes the block position it stood at, while the NPC
     * definition names the job. The recovered marker has no builder-supplied offset or yaw, which
     * only affected where the recruiter itself was placed — and it is already placed.
     */
    private Optional<StructureMarker> recover(org.robtic.minecraft.progression.npc.NpcHandle handle) {
        Optional<String> structureId = npcs.ownerOf(handle);
        Optional<NpcDefinition> definition = npcs.definitionOf(handle);

        if (structureId.isEmpty() || definition.isEmpty() || definition.get().jobId().isBlank()) {
            return Optional.empty();
        }

        Optional<org.robtic.minecraft.progression.api.WorldPoint> anchor =
                StructureMarker.anchorOf(structureId.get());

        if (anchor.isEmpty()) {
            return Optional.empty();
        }

        StructureMarker marker = new StructureMarker(
                definition.get().jobId(), anchor.get(), anchor.get(), 0f, java.util.Map.of());

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
    public void forgetRecruiter(org.robtic.minecraft.progression.npc.NpcHandle handle) {
        recruiters.remove(handle);
    }

    /** Drops the in-memory recruiter index. Called on disable. */
    public void clear() {
        recruiters.clear();
    }
}
