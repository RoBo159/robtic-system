package org.robtic.jobs.workspace.worker;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.license.JobLicenseGate;
import org.robtic.jobs.npc.NpcHandle;
import org.robtic.jobs.npc.NpcService;
import org.robtic.jobs.workspace.BaseLevel;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Taking on and dismissing a business's employees.
 *
 * <h2>Three independent gates, and all of them are the point</h2>
 *
 * Hiring anybody requires, in this order:
 *
 * <ol>
 *   <li>The business is not suspended — a business that cannot trade cannot take on staff.</li>
 *   <li>Its base level unlocks the worker system and has room in the relevant headcount.</li>
 *   <li>The owner holds a valid <b>Manager Licence</b>.</li>
 * </ol>
 *
 * The third is checked last on purpose, because it is the only one that can <em>consume</em> — Core
 * supports consumable licences, and a caller that spends one and then refuses the hire for an
 * unrelated reason has taken a single-use item and given nothing back. This is the same rule
 * {@code JobService#claim} follows, and for the same reason.
 *
 * <h2>Why the licence is reached through an interface</h2>
 *
 * {@link JobLicenseGate} already exists precisely so this plugin can gate something on a licence
 * without importing Core's licence system, with the Core-backed implementation living in the hooks
 * package. Reusing it here keeps "RobticJobs does not own licences" true in the compiler rather than
 * only in the documentation.
 *
 * <h2>Everything is one write</h2>
 *
 * A worker lives on the workspace record, so hiring is a single persist that either lands or does
 * not. There is no separate worker store that could end up holding an employee for a business that
 * never saved, and no reconciliation pass to write.
 */
public final class WorkerService {

    /** Why a hire was refused. Each maps to a message the Worker Manager NPC can explain. */
    public enum HireResult {
        SUCCESS,
        NOT_OWNER,
        SUSPENDED,
        /** The base level does not unlock the worker system at all. */
        LOCKED,
        /** It does, but every slot of this kind is taken. */
        NO_SLOTS,
        /** The owner is not carrying a valid Manager Licence. */
        NO_LICENCE,
        /** The Manager Licence is held but has lapsed. */
        LICENCE_EXPIRED,
        /** An NPC worker named a profession that jobs.yml does not define. */
        UNKNOWN_PROFESSION,
        /** A player worker who is the owner, or is already employed here. */
        INVALID_TARGET,
        CANNOT_AFFORD,
        SAVE_FAILED
    }

    /** The base-level unlock that turns the worker system on. */
    public static final String UNLOCK = "workers";

    private final Plugin plugin;
    private final WorkspaceService workspaces;
    private final NpcService npcs;
    private volatile WorkerSettings settings;

    /** Resolves the Manager Licence. Open until the hook is registered; see {@link JobLicenseGate}. */
    private volatile JobLicenseGate licences = JobLicenseGate.OPEN;

    /** Whether a profession exists, so an NPC worker cannot be bound to one that does not. */
    private volatile java.util.function.Predicate<String> professionExists = profession -> true;

    /**
     * Told when somebody is taken on, with true for an NPC worker.
     *
     * A seam rather than a call into the statistics bridge: this service hires people and must not
     * learn what counts them. Empty by default.
     */
    private volatile java.util.function.BiConsumer<Workspace, Boolean> onHired = (workspace, npc) -> {
    };

    public void onHired(java.util.function.BiConsumer<Workspace, Boolean> listener) {
        this.onHired = listener == null ? (workspace, npc) -> {
        } : listener;
    }

    /**
     * Businesses with a hire or dismissal in flight.
     *
     * A hire spends a licence and may spend money, and both are visible in a way a redundant map
     * write is not. Two clicks on the Worker Manager must not produce two employees against one
     * slot.
     */
    private final Set<String> busy = ConcurrentHashMap.newKeySet();

    public WorkerService(
            Plugin plugin,
            WorkspaceService workspaces,
            NpcService npcs,
            WorkerSettings settings
    ) {
        this.plugin = plugin;
        this.workspaces = workspaces;
        this.npcs = npcs;
        this.settings = settings;
    }

    public void licences(JobLicenseGate gate) {
        this.licences = gate == null ? JobLicenseGate.OPEN : gate;
    }

    public void professions(java.util.function.Predicate<String> exists) {
        this.professionExists = exists == null ? profession -> true : exists;
    }

    public WorkerSettings settings() {
        return settings;
    }

    /** Swapped wholesale on reload, so a yield table edit never half-applies. */
    public void settings(WorkerSettings replacement) {
        this.settings = replacement;
    }

    // ─── Limits ───────────────────────────────────────────────────────────────────────────────

    /**
     * Whether this business can employ anybody at all.
     *
     * Distinct from having a free slot: a business below the unlocking level should be told that the
     * system is not available yet, not that it is full.
     */
    public boolean unlocked(Workspace workspace) {
        return workspaces.baseOf(workspace).unlocks(UNLOCK);
    }

    /** How many NPC workers this business may employ, from its base level. */
    public int npcCapacity(Workspace workspace) {
        return workspaces.baseOf(workspace).npcWorkers();
    }

    /** How many players it may hire. */
    public int playerCapacity(Workspace workspace) {
        return workspaces.baseOf(workspace).playerWorkers();
    }

    public int npcFreeSlots(Workspace workspace) {
        return Math.max(0, npcCapacity(workspace) - workspace.npcWorkers().size());
    }

    public int playerFreeSlots(Workspace workspace) {
        return Math.max(0, playerCapacity(workspace) - workspace.playerWorkers().size());
    }

    // ─── Hiring ───────────────────────────────────────────────────────────────────────────────

    /**
     * Takes on an NPC worker.
     *
     * @param profession which job it will do. Bound for life: reassigning is a dismissal and a new
     *                   hire, so the owner makes that decision knowingly
     * @param workArea   the marked area it works, or blank for the business's own
     * @param whenDone   called on the main thread with the outcome
     */
    public void hireNpc(
            Player owner,
            Workspace workspace,
            String profession,
            String workArea,
            java.util.function.Consumer<HireResult> whenDone
    ) {
        HireResult refusal = check(owner, workspace, true);

        if (refusal != null) {
            whenDone.accept(refusal);
            return;
        }

        if (!professionExists.test(profession)) {
            whenDone.accept(HireResult.UNKNOWN_PROFESSION);
            return;
        }

        if (!busy.add(workspace.id())) {
            whenDone.accept(HireResult.SAVE_FAILED);
            return;
        }

        // Last, because it can consume. Everything above is free to refuse.
        HireResult licence = checkLicence(owner, "worker-hire:npc:" + profession);

        if (licence != null) {
            busy.remove(workspace.id());
            whenDone.accept(licence);
            return;
        }

        long now = System.currentTimeMillis();

        NpcWorker worker = NpcWorker.hire(
                profession,
                workArea,
                settings.npcSalary(),
                settings.maintenanceInterval().toMillis(),
                now);

        commit(workspace, worker, whenDone);
    }

    /**
     * Hires a player.
     *
     * @param permissions what they may do; see {@link PlayerWorker}
     */
    public void hirePlayer(
            Player owner,
            Workspace workspace,
            UUID target,
            Set<String> permissions,
            double salary,
            java.util.function.Consumer<HireResult> whenDone
    ) {
        HireResult refusal = check(owner, workspace, false);

        if (refusal != null) {
            whenDone.accept(refusal);
            return;
        }

        // The owner already has every permission by owning the place. A second, weaker record of
        // what they may do is a bug waiting for the two to disagree.
        if (workspace.ownedBy(target) || workspace.workerFor(target).isPresent()) {
            whenDone.accept(HireResult.INVALID_TARGET);
            return;
        }

        if (!busy.add(workspace.id())) {
            whenDone.accept(HireResult.SAVE_FAILED);
            return;
        }

        HireResult licence = checkLicence(owner, "worker-hire:player");

        if (licence != null) {
            busy.remove(workspace.id());
            whenDone.accept(licence);
            return;
        }

        PlayerWorker worker = PlayerWorker.hire(
                target, permissions, salary, System.currentTimeMillis());

        commit(workspace, worker, whenDone);
    }

    /**
     * Every gate but the licence.
     *
     * @return null when the hire may proceed
     */
    private HireResult check(Player owner, Workspace workspace, boolean npcWorker) {
        if (!workspace.ownedBy(owner.getUniqueId())
                && !owner.hasPermission(WorkspaceService.BYPASS)) {
            return HireResult.NOT_OWNER;
        }

        if (workspaces.suspended(workspace)) {
            return HireResult.SUSPENDED;
        }

        if (!unlocked(workspace)) {
            return HireResult.LOCKED;
        }

        int free = npcWorker ? npcFreeSlots(workspace) : playerFreeSlots(workspace);

        return free > 0 ? null : HireResult.NO_SLOTS;
    }

    /**
     * Spends the owner's Manager Licence.
     *
     * @return null when it was held, in date, and accepted
     */
    private HireResult checkLicence(Player owner, String action) {
        // Read from the workspace settings rather than this system's own file, so the licence a
        // business operates under and the licence its manager needs are named in one place. Two
        // copies is how a rename fixes one gate and silently disables the other.
        String licenceId = workspaces.settings().managerLicenseId();

        return switch (licences.check(owner, licenceId, action)) {
            case ALLOWED -> null;
            case EXPIRED -> HireResult.LICENCE_EXPIRED;
            case MISSING, REFUSED -> HireResult.NO_LICENCE;
        };
    }

    /**
     * Persists a new worker and, for an NPC one, puts it in the world.
     *
     * The record is committed before anything is spawned, on the same principle the claim path
     * follows: a failed save must never leave a figure standing for an employee nobody has.
     */
    private void commit(
            Workspace workspace,
            Worker worker,
            java.util.function.Consumer<HireResult> whenDone
    ) {
        String workspaceId = workspace.id();

        // Re-read, because the checks above ran against a snapshot and the persist is what decides.
        Optional<Workspace> latest = workspaces.byId(workspaceId);

        if (latest.isEmpty()) {
            busy.remove(workspaceId);
            whenDone.accept(HireResult.SAVE_FAILED);
            return;
        }

        Workspace previous = latest.get();
        Workspace hired = previous.withWorker(worker);

        workspaces.persist(previous, hired, saved -> {
            busy.remove(workspaceId);

            if (!saved) {
                whenDone.accept(HireResult.SAVE_FAILED);
                return;
            }

            // The world is touched only once the record is safe, exactly as the claim path does: a
            // failed save must never leave a figure standing for an employee nobody has.
            if (worker instanceof NpcWorker npcWorker) {
                spawn(hired, npcWorker);
            }

            try {
                onHired.accept(hired, worker instanceof NpcWorker);
            } catch (RuntimeException failure) {
                // A listener that throws must not turn a completed hire into a reported failure —
                // the employee exists and the money is spent either way.
                plugin.getLogger().log(Level.WARNING,
                        "A listener threw while recording a hire; the hire itself stands.", failure);
            }

            whenDone.accept(HireResult.SUCCESS);
        });
    }

    // ─── The figures in the world ─────────────────────────────────────────────────────────────

    /**
     * Puts an NPC worker's figure in the world and records the handle.
     *
     * A failed spawn is not a failed hire. The employee exists in the record, is paid, and produces
     * — the figure is a representation of it, and {@link #repair} puts it back on the next pass.
     */
    private void spawn(Workspace workspace, NpcWorker worker) {
        Optional<Location> anchor = workspace.anchor().toLocation();

        if (anchor.isEmpty()) {
            return;
        }

        // Fanned out around the anchor so several workers do not stand inside one another. The exact
        // arrangement is cosmetic; not overlapping is not.
        int index = workspace.npcWorkers().indexOf(worker);
        double angle = index < 0 ? 0d : index * (Math.PI / 3d);

        Location where = anchor.get().clone().add(
                Math.cos(angle) * settings.npcSpacing(),
                1.0d,
                Math.sin(angle) * settings.npcSpacing());

        Optional<NpcHandle> handle = npcs.spawn(settings.npcDefinition(), where, workspace.id());

        handle.ifPresent(spawned ->
                workspaces.repository().put(workspace.withWorker(worker.withNpc(spawned))));
    }

    /**
     * Respawns any worker figure that has gone missing.
     *
     * The same repair pass {@code WorkspaceService#repairAll} runs for role NPCs, and for the same
     * reasons: a chunk purge, a crash, an operator removing one by hand, a backend switch. Cheap,
     * because a worker whose figure is alive costs one existence check.
     */
    public void repair(Workspace workspace) {
        if (workspace.anchor().toLocation().isEmpty()) {
            return;
        }

        for (NpcWorker worker : workspace.npcWorkers()) {
            boolean alive = worker.npc().map(npcs::exists).orElse(false);

            if (!alive) {
                spawn(workspace, worker);
            }
        }
    }

    // ─── Dismissal ────────────────────────────────────────────────────────────────────────────

    /**
     * Dismisses a worker.
     *
     * @return false when no such worker is employed here
     */
    public boolean dismiss(Workspace workspace, String workerId) {
        Optional<Worker> found = workspace.worker(workerId);

        if (found.isEmpty()) {
            return false;
        }

        if (found.get() instanceof NpcWorker npcWorker) {
            npcWorker.npc().ifPresent(npcs::remove);
        }

        workspaces.repository().put(workspace.withoutWorker(workerId));
        return true;
    }

    /**
     * Dismisses everybody and removes their figures.
     *
     * The abandonment path's entry point. The figures are removed here rather than left to the
     * workspace's own sweep, because a worker's NPC is owned by the workspace id and would otherwise
     * outlive the employment that justified it.
     */
    public void dismissAll(Workspace workspace) {
        for (NpcWorker worker : workspace.npcWorkers()) {
            worker.npc().ifPresent(npcs::remove);
        }

        workspaces.repository().put(workspace.withoutWorkers());
    }

    /**
     * Dismisses whoever no longer fits.
     *
     * Base-level worker limits cannot fall in a valid configuration — the config check refuses a
     * ladder where they do — but an operator can still lower one on a running server and reload.
     * This exists so that state is reconciled deliberately, newest employees first, rather than
     * being left as a business quietly over its limit that nothing will ever correct.
     *
     * @return how many were let go
     */
    public int trimToLimits(Workspace workspace) {
        int overNpc = workspace.npcWorkers().size() - npcCapacity(workspace);
        int overPlayer = workspace.playerWorkers().size() - playerCapacity(workspace);

        if (overNpc <= 0 && overPlayer <= 0) {
            return 0;
        }

        Workspace current = workspace;
        int dismissed = 0;

        for (NpcWorker worker : newestFirst(current.npcWorkers(), overNpc)) {
            worker.npc().ifPresent(npcs::remove);
            current = current.withoutWorker(worker.id());
            dismissed++;
        }

        for (PlayerWorker worker : newestFirst(current.playerWorkers(), overPlayer)) {
            current = current.withoutWorker(worker.id());
            dismissed++;
        }

        if (dismissed > 0) {
            plugin.getLogger().warning("Business " + workspace.id() + " employed more workers than"
                    + " base level " + workspace.level() + " permits. " + dismissed + " of the most"
                    + " recently hired were dismissed.");

            workspaces.repository().put(current);
        }

        return dismissed;
    }

    /** The most recently hired, so seniority is what survives a limit being lowered. */
    private static <T extends Worker> java.util.List<T> newestFirst(java.util.List<T> workers, int count) {
        if (count <= 0) {
            return java.util.List.of();
        }

        return workers.stream()
                .sorted((a, b) -> Long.compare(b.hiredAt(), a.hiredAt()))
                .limit(count)
                .toList();
    }

    /** Whether a base level's requirements permit a worker to exist. Also used by the yield tick. */
    public boolean employable(Workspace workspace) {
        BaseLevel base = workspaces.baseOf(workspace);
        return base.unlocks(UNLOCK) && !workspaces.suspended(workspace);
    }
}
