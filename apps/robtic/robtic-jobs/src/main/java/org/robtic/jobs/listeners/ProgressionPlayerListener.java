package org.robtic.jobs.listeners;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.events.PlayerLoseJobEvent;
import org.robtic.jobs.market.SellQuotas;
import org.robtic.jobs.storage.ProgressionRepository;
import org.robtic.core.titles.TitleService;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;

/**
 * Loading, saving and the world hooks the progression system needs.
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
    private final SellQuotas quotas;
    private final org.robtic.jobs.workspace.lifecycle.BusinessLifecycleService lifecycle;

    public ProgressionPlayerListener(
            Plugin plugin,
            ProgressionRepository repository,
            TitleService titles,
            WorkspaceService workspaces,
            SellQuotas quotas,
            org.robtic.jobs.workspace.lifecycle.BusinessLifecycleService lifecycle
    ) {
        this.plugin = plugin;
        this.repository = repository;
        this.titles = titles;
        this.workspaces = workspaces;
        this.quotas = quotas;
        this.lifecycle = lifecycle;
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

        // A join is the reliable moment to read somebody's Workspace Licence, because it is the one
        // time they are certainly online and their inventory is certainly loaded. Every later
        // decision about their businesses — warn, suspend, abandon — is made from what is copied
        // here, so this is what keeps a month-old snapshot from deciding somebody's fate.
        //
        // Deferred by a tick: the inventory is not reliably populated during the join event itself,
        // and a licence read a tick early reports "not carrying one" for a player who is.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (!event.getPlayer().isOnline()) {
                return;
            }

            workspaces.ownedBy(event.getPlayer().getUniqueId())
                    .forEach(workspace -> lifecycle.observe(event.getPlayer(), workspace));
        });
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        repository.unload(event.getPlayer().getUniqueId());
        quotas.forget(event.getPlayer().getUniqueId());
    }

    // There was a ChunkLoadEvent handler here that scanned every newly generated chunk for this
    // plugin's own sign markers. It is gone: RobticWorld owns marker scanning, and this plugin now
    // hears about structures through StructureScannedEvent — see StructureScanListener. Two modules
    // sweeping the same chunks for two marker formats was the duplication, and the forgeable
    // text-based format was the bug.

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
