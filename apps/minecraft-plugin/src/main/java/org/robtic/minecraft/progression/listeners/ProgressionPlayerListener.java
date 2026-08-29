package org.robtic.minecraft.progression.listeners;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.events.PlayerLoseJobEvent;
import org.robtic.minecraft.progression.market.SellQuotas;
import org.robtic.minecraft.progression.storage.ProgressionRepository;
import org.robtic.minecraft.progression.titles.TitleService;
import org.robtic.minecraft.progression.workspace.DiscoveryService;
import org.robtic.minecraft.progression.workspace.Workspace;
import org.robtic.minecraft.progression.workspace.WorkspaceService;

/**
 * Loading, saving and the world hooks the progression system needs.
 *
 * <h2>Why the chunk hook is here rather than in the discovery service</h2>
 *
 * {@link DiscoveryService} decides what a marker means; this decides when to go looking. Keeping the
 * Bukkit event out of the service is what lets discovery be driven by an admin rescan command, a
 * test, or a different trigger entirely without the service caring where the call came from.
 *
 * <h2>Resignation cleanup</h2>
 *
 * The workspace is released here, in response to {@link PlayerLoseJobEvent}, rather than inside
 * {@code JobService}. The job service has no business knowing what a building is — and doing it this
 * way means an admin command, a plugin, or a future "fired for inactivity" system all clean up
 * correctly without any of them remembering to.
 */
public final class ProgressionPlayerListener implements Listener {

    private final Plugin plugin;
    private final ProgressionRepository repository;
    private final TitleService titles;
    private final WorkspaceService workspaces;
    private final DiscoveryService discovery;
    private final SellQuotas quotas;

    public ProgressionPlayerListener(
            Plugin plugin,
            ProgressionRepository repository,
            TitleService titles,
            WorkspaceService workspaces,
            DiscoveryService discovery,
            SellQuotas quotas
    ) {
        this.plugin = plugin;
        this.repository = repository;
        this.titles = titles;
        this.workspaces = workspaces;
        this.discovery = discovery;
        this.quotas = quotas;
    }

    /**
     * Loads a joining player and reapplies their title.
     *
     * The display is reapplied on every join rather than only when it changes, which makes this the
     * repair path for a permissions plugin that was reset, a prefix edited by hand, or a title
     * applied while LuckPerms happened to be reloading. This system is the authority; the prefix is
     * a projection of it, and a projection should be rebuilt from the source when cheap.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        repository.load(event.getPlayer().getUniqueId(),
                progression -> titles.applyDisplay(event.getPlayer().getUniqueId()));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        repository.unload(event.getPlayer().getUniqueId());
        quotas.forget(event.getPlayer().getUniqueId());
    }

    /**
     * Scans newly generated chunks for structure markers.
     *
     * {@code isNewChunk} is the whole reason this is affordable — see {@link DiscoveryService} for
     * the cost breakdown. Chunks that have loaded before are skipped without any work at all.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onChunkLoad(ChunkLoadEvent event) {
        discovery.examine(event.getChunk(), event.isNewChunk());
    }

    /**
     * Releases the workspace when a player leaves a job.
     *
     * Deferred by a tick. The event fires before the job is actually removed, and releasing the
     * workspace synchronously would have the NPC removal and the storage write racing the job
     * removal that triggered them.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLoseJob(PlayerLoseJobEvent event) {
        java.util.List<Workspace> owned =
                workspaces.ownedBy(event.getPlayerId()).stream()
                        .filter(workspace -> workspace.professionId().equals(event.getJob().id()))
                        .toList();

        if (owned.isEmpty()) {
            return;
        }

        plugin.getServer().getScheduler().runTask(plugin,
                () -> owned.forEach(workspaces::release));
    }
}
