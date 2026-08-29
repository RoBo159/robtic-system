package org.robtic.jobs.workspace.worker;

import org.bukkit.plugin.Plugin;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;

import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Level;

/**
 * What NPC workers actually do: produce, on a timer, into their assigned storage.
 *
 * <h2>Accrual, not simulation</h2>
 *
 * A worker does not walk to a work area, does not break a block and does not place one. It is owed
 * output for elapsed time, and that output appears in the destination it was assigned. The
 * alternative — an NPC that pathfinds and mines — needs chunks kept loaded, blocks restored,
 * griefing handled and a tick budget nobody has, for a result players would mostly watch rather than
 * benefit from.
 *
 * Accrual also makes the feature honest while nobody is looking, which is the entire premise of
 * employing somebody: a business should earn while its owner is offline, and a simulated worker in an
 * unloaded chunk earns nothing.
 *
 * <h2>Elapsed time, not ticks observed</h2>
 *
 * Every payout is computed from {@code now - lastYieldAt}. A server that was down for a day owes a
 * day; a server that ran the sweep twice in a minute owes one minute. Counting sweeps instead would
 * make output depend on uptime, and a restart would quietly rob every employer on the server.
 *
 * The catch-up is capped — see {@link WorkerSettings#maxCatchUpIntervals()} — because "owed" and
 * "credited in one instant" are different things. A week of downtime paying a week of ore into
 * everybody's storage at once is a shock to the economy and looks exactly like a duplication bug.
 *
 * <h2>What stops a worker producing</h2>
 *
 * A suspended business, a business below the unlocking base level, and an unmaintained worker. Each
 * of them still advances {@code lastYieldAt}, so time spent stopped is not banked and paid out the
 * moment the problem is fixed. That is the difference between a consequence and a delay.
 */
public final class WorkerYieldService {

    private final Plugin plugin;
    private final WorkspaceService workspaces;
    private final WorkerService workers;

    private volatile WorkerSettings settings;

    /** Cancelled on disable. */
    private int taskId = -1;

    public WorkerYieldService(
            Plugin plugin,
            WorkspaceService workspaces,
            WorkerService workers,
            WorkerSettings settings
    ) {
        this.plugin = plugin;
        this.workspaces = workspaces;
        this.workers = workers;
        this.settings = settings;
    }

    public void settings(WorkerSettings replacement) {
        this.settings = replacement;
    }

    /**
     * Starts the sweep.
     *
     * @param periodTicks how often to look. Deliberately unrelated to the yield interval: the sweep
     *                    only has to notice that an interval has elapsed, and running it more often
     *                    than that changes nothing about what is paid
     */
    public void start(long periodTicks) {
        if (!settings.enabled()) {
            return;
        }

        taskId = plugin.getServer().getScheduler().scheduleSyncRepeatingTask(
                plugin, this::sweep, periodTicks, periodTicks);
    }

    public void stop() {
        if (taskId != -1) {
            plugin.getServer().getScheduler().cancelTask(taskId);
            taskId = -1;
        }
    }

    /**
     * Pays every business's workers whatever they are owed.
     *
     * Runs on the main thread and touches only in-memory records plus the repository's own write
     * path, which is what makes it safe to do for every business in one pass. A server with enough
     * businesses for that to matter would move this to a rolling window; the shape here is
     * deliberately the simple one until that is a real problem.
     */
    public void sweep() {
        long now = System.currentTimeMillis();

        for (Workspace workspace : workspaces.repository().all()) {
            try {
                tick(workspace, now);
            } catch (RuntimeException failure) {
                // One business's problem must not stop everybody else's workers being paid.
                plugin.getLogger().log(Level.WARNING, "Could not run the worker yield for business "
                        + workspace.id() + ".", failure);
            }
        }
    }

    private void tick(Workspace workspace, long now) {
        if (workspace.npcWorkers().isEmpty()) {
            return;
        }

        long interval = settings.yieldInterval().toMillis();
        boolean producing = workers.employable(workspace);

        Workspace current = workspace;
        boolean changed = false;

        for (NpcWorker worker : workspace.npcWorkers()) {
            long elapsed = now - worker.lastYieldAt();

            if (elapsed < interval) {
                continue;
            }

            long due = Math.min(elapsed / interval, settings.maxCatchUpIntervals());

            // The clock advances whether or not anything was produced. A stopped worker must not
            // bank the time and pay it out the moment the business is unsuspended — that would make
            // suspension a delay rather than a cost.
            current = current.withWorker(worker.yielded(now));
            changed = true;

            if (!producing || worker.maintenanceOverdue(now)) {
                continue;
            }

            current = produce(current, worker, (int) due);
        }

        if (changed) {
            workspaces.repository().put(current);
        }
    }

    /**
     * Credits one worker's output for a number of intervals.
     *
     * <h2>Overflow is dropped, deliberately and visibly</h2>
     *
     * Storage that is full stops accepting. The rejected count is discarded rather than held,
     * because a backlog would mean a worker whose owner never empties storage quietly accrues an
     * unbounded debt that lands the moment they do. A full business simply stops earning, which is a
     * consequence an owner can see and fix.
     */
    private Workspace produce(Workspace workspace, NpcWorker worker, int intervals) {
        if (!NpcWorker.OWN_STORAGE.equals(worker.storageDestination())) {
            // The only destination that exists today. A worker pointed anywhere else keeps its
            // setting and produces nothing until whatever owns that destination is built — which is
            // why the field is on the record rather than assumed.
            return workspace;
        }

        int capacity = workspaces.capacityOf(workspace);
        var storage = workspace.storage();

        for (WorkerSettings.Yield yield : settings.yieldFor(worker.professionId())) {
            if (yield.amount() <= 0) {
                continue;
            }

            int produced = 0;

            // Rolled per interval rather than once for the whole catch-up, so a worker owed six
            // intervals at a one-in-three chance is paid roughly twice — not all six or none.
            for (int interval = 0; interval < intervals; interval++) {
                if (yield.chance() >= 1d || ThreadLocalRandom.current().nextDouble() < yield.chance()) {
                    produced += yield.amount();
                }
            }

            if (produced == 0) {
                continue;
            }

            storage = storage.deposit(yield.material(), produced, capacity).storage();
        }

        return workspace.withStorage(storage);
    }

    /**
     * Whether anything at all could be produced here.
     *
     * Used by the Worker Manager menu to explain an idle workforce, so an owner is told "your
     * licence has lapsed" rather than being left to notice that storage has stopped filling.
     */
    public Set<String> idleReasons(Workspace workspace) {
        Set<String> reasons = new java.util.LinkedHashSet<>();

        if (workspaces.suspended(workspace)) {
            reasons.add("suspended");
        }

        if (!workers.unlocked(workspace)) {
            reasons.add("locked");
        }

        long now = System.currentTimeMillis();

        if (workspace.npcWorkers().stream().anyMatch(worker -> worker.maintenanceOverdue(now))) {
            reasons.add("maintenance");
        }

        return reasons;
    }
}
