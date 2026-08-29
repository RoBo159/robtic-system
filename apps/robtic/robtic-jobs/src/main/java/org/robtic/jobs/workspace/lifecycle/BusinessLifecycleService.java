package org.robtic.jobs.workspace.lifecycle;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.notify.Notification;
import org.robtic.core.notify.NotificationService;
import org.robtic.core.util.Durations;
import org.robtic.jobs.license.JobLicenseGate;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;
import org.robtic.jobs.workspace.worker.WorkerService;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Level;

/**
 * The Workspace Licence's whole life: warned, lapsed, in grace, abandoned.
 *
 * <pre>
 *   licensed  ──── warnings at 3d, 1d, 12h, 1h ────▶  lapses
 *                                                        │
 *                                       ┌── renewed ─────┤
 *                                       │                ▼
 *                                       │           SUSPENDED
 *                                       │        (grace period runs)
 *                                       │                │
 *                                       ▼                ▼
 *                                  restored         ABANDONED
 *                                                        │
 *                                            new random profession,
 *                                            recruiter, claimable again
 * </pre>
 *
 * <h2>A snapshot, because a licence is an item</h2>
 *
 * The licence lives in the owner's inventory, so reading one needs them online — and the owner who
 * most needs judging is the one who has not logged in for a month. So the expiry is copied onto the
 * business whenever anybody can look (a join, an interaction, a sweep that finds them online) and
 * every decision below is made from that copy.
 *
 * A business nobody has ever been able to look at has a snapshot of zero and is treated as fully
 * licensed, forever, until somebody can look. That direction is not negotiable: failing open costs
 * an unlicensed business some extra trading; failing closed destroys months of somebody's work
 * because a server could not read an inventory.
 *
 * <h2>Suspension takes nothing away</h2>
 *
 * A suspended business stops trading — no selling, no upgrades, no hiring, no worker output. Nothing
 * is deleted: the level, the upgrades, the storage, the staff and the region are all exactly where
 * they were, and renewing restores every one of them instantly because none of them was ever
 * touched. That is what makes the grace period a genuine second chance rather than a countdown to a
 * partial refund.
 *
 * <h2>Abandonment is the one destructive path in the system</h2>
 *
 * It is therefore the most carefully gated. It requires a snapshot that exists, an expiry that has
 * passed, and a full grace period elapsed on top of that — and it is the only place in this plugin
 * that removes a player's business without the player asking.
 */
public final class BusinessLifecycleService {

    /** The notification category. Routed in {@code notifications.yml}. */
    public static final String CATEGORY = "business";

    private final Plugin plugin;
    private final WorkspaceService workspaces;
    private final WorkerService workers;

    private volatile NotificationService notifications = NotificationService.NONE;
    private volatile JobLicenseGate licences = JobLicenseGate.OPEN;

    /**
     * Reassigns an abandoned building and spawns its new recruiter.
     *
     * A function rather than a direct call, so this package never learns what a profession or a
     * recruiter is. See {@code ProfessionReassignment}.
     */
    private volatile Reassigner reassigner = (workspace, whenDone) -> whenDone.accept(Optional.empty());

    /** Clears the notification memory for a business, so its warnings can fire again. */
    private volatile Consumer<String> forgetWarnings = prefix -> {
    };

    /**
     * Told when a business is abandoned, before anything is reset.
     *
     * A seam rather than a direct call to the statistics bridge, for the same reason
     * {@link WorkspaceExtension} is one: this service records a lifecycle outcome and must not learn
     * what counts it. Empty by default, so a server with no statistics system loses nothing.
     */
    private volatile Consumer<Workspace> onAbandoned = workspace -> {
    };

    public void onAbandoned(Consumer<Workspace> listener) {
        this.onAbandoned = listener == null ? workspace -> {
        } : listener;
    }

    private int taskId = -1;

    /** How an abandoned business gets a new profession and a recruiter. */
    @FunctionalInterface
    public interface Reassigner {

        /**
         * @param whenDone called on the main thread with the new profession id, or empty when none
         *                 could be chosen — in which case the business is left abandoned but
         *                 unclaimable, which an operator can repair with a rescan
         */
        void reassign(Workspace workspace, Consumer<Optional<String>> whenDone);
    }

    public BusinessLifecycleService(Plugin plugin, WorkspaceService workspaces, WorkerService workers) {
        this.plugin = plugin;
        this.workspaces = workspaces;
        this.workers = workers;
    }

    public void notifications(NotificationService service) {
        this.notifications = service == null ? NotificationService.NONE : service;
    }

    public void licences(JobLicenseGate gate) {
        this.licences = gate == null ? JobLicenseGate.OPEN : gate;
    }

    public void reassigner(Reassigner reassigner) {
        this.reassigner = reassigner;
    }

    public void forgetWarnings(Consumer<String> forget) {
        this.forgetWarnings = forget == null ? prefix -> {
        } : forget;
    }

    // ─── The sweep ────────────────────────────────────────────────────────────────────────────

    public void start(long periodTicks) {
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
     * Evaluates every business.
     *
     * Deliberately slow-running and idempotent. Anything a player is actually using is also
     * evaluated when they touch it — see {@link #observe} — so this only has to catch the ones
     * nobody has visited.
     */
    public void sweep() {
        long now = System.currentTimeMillis();

        for (Workspace workspace : workspaces.repository().all()) {
            try {
                evaluate(workspace, now);
            } catch (RuntimeException failure) {
                // One business's problem must never stop the rest being evaluated — and this is the
                // sweep that decides whether businesses are destroyed, so an exception escaping it
                // would silently freeze the whole lifecycle.
                plugin.getLogger().log(Level.WARNING,
                        "Could not evaluate the licence lifecycle for business " + workspace.id()
                                + ". It was left exactly as it was.", failure);
            }
        }
    }

    /**
     * Refreshes a business's licence snapshot from its owner, who must be online.
     *
     * Called on join and whenever the owner interacts with their business. This is what keeps the
     * snapshot honest; the sweep only reads it.
     */
    public void observe(Player owner, Workspace workspace) {
        if (!workspace.ownedBy(owner.getUniqueId())) {
            return;
        }

        long now = System.currentTimeMillis();
        Workspace refreshed = refreshSnapshot(owner, workspace, now);

        evaluate(refreshed, now);
    }

    /**
     * Copies what the owner is carrying onto the business.
     *
     * @return the workspace with an up-to-date snapshot, or the one passed in when nothing could be
     *         read
     */
    private Workspace refreshSnapshot(Player owner, Workspace workspace, long now) {
        JobLicenseGate.LicenceSnapshot snapshot =
                licences.snapshot(owner, workspaces.settings().licenseId());

        long expiresAt = switch (snapshot.presence()) {
            case HELD -> snapshot.expiresAt();
            // Not carrying one is a lapse that started now, not an absence of information. Recording
            // it as an expiry rather than as zero is what starts the grace period.
            case NOT_HELD -> now;
            case UNKNOWN -> 0L;
        };

        if (snapshot.presence() == JobLicenseGate.LicenceSnapshot.Presence.UNKNOWN) {
            return workspace;
        }

        // A renewal moves the expiry forward. The warnings already sent are forgotten so the next
        // period warns again — otherwise a licence renewed and left to lapse a second time would
        // lapse in silence.
        if (expiresAt > workspace.licenseExpiresAt()) {
            forgetWarnings.accept(warningPrefix(workspace));
        }

        Workspace updated = workspace.withLicenseSnapshot(expiresAt, now);

        if (updated.licenseExpiresAt() != workspace.licenseExpiresAt()) {
            workspaces.repository().put(updated);
        }

        return updated;
    }

    // ─── The decision ─────────────────────────────────────────────────────────────────────────

    /**
     * Applies whatever the snapshot now implies.
     *
     * Idempotent: running it twice in a row changes nothing the second time, which is what makes it
     * safe on both a timer and an interaction.
     */
    public void evaluate(Workspace workspace, long now) {
        // Never observed. Fully licensed until somebody can look — see the class notes.
        if (workspace.licenseExpiresAt() <= 0) {
            return;
        }

        if (!workspace.licenseLapsed(now)) {
            warnIfDue(workspace, now);
            restoreIfSuspended(workspace);
            return;
        }

        long graceEndsAt = workspace.licenseExpiresAt() + workspaces.settings().licenseGrace().toMillis();

        if (now < graceEndsAt) {
            suspend(workspace, graceEndsAt - now);
            return;
        }

        abandon(workspace);
    }

    /**
     * Sends the first warning threshold the remaining time has fallen below.
     *
     * The list is sorted longest first, so the first match is the tightest threshold already passed
     * — a licence with 20 hours left fires the 1-day warning, not the 3-day one. Each id names the
     * business and the threshold, so the dispatcher's deduplication makes it once per licence period
     * rather than once per sweep.
     */
    private void warnIfDue(Workspace workspace, long now) {
        long remaining = workspace.licenseRemaining(now);

        // Permanent licences never approach anything.
        if (remaining <= 0 || workspace.licenseExpiresAt() == JobLicenseGate.LicenceSnapshot.PERMANENT) {
            return;
        }

        List<Duration> thresholds = workspaces.settings().licenseWarnings();

        for (Duration threshold : thresholds) {
            if (remaining > threshold.toMillis()) {
                continue;
            }

            notifications.send(Notification.to(workspace.owner())
                    .id(warningPrefix(workspace) + threshold.toMinutes())
                    .category(CATEGORY)
                    .title("&e⚠ &fYour Workspace Licence expires in "
                            + Durations.format(threshold.toMillis()))
                    .line("&7Business: &f" + workspace.professionId())
                    .line("&7Renew it at the Licence Officer to keep trading.")
                    .line("&7If it lapses you have &f"
                            + Durations.format(workspaces.settings().licenseGrace().toMillis())
                            + " &7to renew before the business is lost.")
                    // The tightest thresholds are the last chance somebody has, so they interrupt.
                    .priority(threshold.toHours() <= 12
                            ? Notification.Priority.URGENT
                            : Notification.Priority.IMPORTANT)
                    .context("Profession", workspace.professionId())
                    .context("Base level", String.valueOf(workspace.level()))
                    .context("Expires in", Durations.format(remaining))
                    .build());

            return;
        }
    }

    /** Puts a suspended business back to work once its licence is valid again. */
    private void restoreIfSuspended(Workspace workspace) {
        if (!workspaces.suspended(workspace)) {
            return;
        }

        // Only the licence half is this service's to lift. A business also behind on tax stays
        // suspended, and the tax service restores it when that is settled — two independent causes
        // with one effect, and neither may clear the other's.
        if (workspace.taxSuspended()) {
            return;
        }

        workspaces.staffNpcs(workspace);
        workers.repair(workspace);

        notifications.send(Notification.to(workspace.owner())
                .id("business-restored:" + workspace.id() + ":" + workspace.licenseExpiresAt())
                .category(CATEGORY)
                .title("&a✔ &fYour business is trading again")
                .line("&7Everything was kept: your base level, upgrades, storage and staff.")
                .priority(Notification.Priority.IMPORTANT)
                .build());
    }

    /**
     * Stops a business trading, and says so.
     *
     * The suspension itself is derived rather than stored — {@code WorkspaceService#suspended} reads
     * the snapshot — so all this has to do is make the world match: take the NPCs down, and tell the
     * owner what is about to happen and by when.
     */
    private void suspend(Workspace workspace, long graceRemaining) {
        workspaces.staffNpcs(workspace);

        notifications.send(Notification.to(workspace.owner())
                .id("business-suspended:" + workspace.id() + ":" + workspace.licenseExpiresAt())
                .category(CATEGORY)
                .title("&c✖ &fYour Workspace Licence has expired")
                .line("&7Your business is suspended: no selling, upgrades, hiring or worker output.")
                .line("&7&lNothing has been lost.&r&7 Renew and it all comes straight back.")
                .line("&c You have " + Durations.format(graceRemaining)
                        + " &7before the business is abandoned and given to somebody else.")
                .priority(Notification.Priority.URGENT)
                .context("Profession", workspace.professionId())
                .context("Base level", String.valueOf(workspace.level()))
                .context("Grace remaining", Durations.format(graceRemaining))
                .build());
    }

    // ─── Abandonment ──────────────────────────────────────────────────────────────────────────

    /**
     * Takes the business away and offers the building to somebody else.
     *
     * <h2>Order matters, and this is the order</h2>
     *
     * The owner is told first, while there is still a business to describe. Staff are dismissed and
     * their figures removed before the record is reset, because a worker's NPC is owned by the
     * business id and would otherwise outlive the employment that justified it. The record is reset
     * only then, and the reassignment — a new profession and its recruiter — runs last, against a
     * business that is already clean.
     */
    private void abandon(Workspace workspace) {
        UUID owner = workspace.owner();
        String professionWas = workspace.professionId();

        notifications.send(Notification.to(owner)
                .id("business-abandoned:" + workspace.id() + ":" + workspace.licenseExpiresAt())
                .category(CATEGORY)
                .title("&4✖ &fYour business has been abandoned")
                .line("&7Your Workspace Licence lapsed and the grace period ran out.")
                .line("&7The " + professionWas + " building has been returned to the world and is")
                .line("&7now offered to somebody else under a new trade.")
                .priority(Notification.Priority.URGENT)
                .context("Profession", professionWas)
                .context("Base level", String.valueOf(workspace.level()))
                .build());

        // Before anything is reset, while the record still describes what was lost.
        try {
            onAbandoned.accept(workspace);
        } catch (RuntimeException failure) {
            plugin.getLogger().log(Level.WARNING, "A listener threw while recording an abandonment;"
                    + " the abandonment itself continued.", failure);
        }

        plugin.getLogger().info("Business " + workspace.id() + " (" + professionWas + ", owner "
                + owner + ") was abandoned after its licence lapsed. It held "
                + workspace.storage().used() + " item(s), " + workspace.npcWorkers().size()
                + " NPC worker(s) and " + workspace.playerWorkers().size() + " hired player(s) at"
                + " base level " + workspace.level() + ".");

        // Staff go first, so their figures are removed while the records that own them still exist.
        workers.dismissAll(workspace);

        // Then every role NPC. The building is about to belong to nobody.
        workspaces.unstaffNpcs(workspace);

        // Warnings are forgotten wholesale: the next owner starts a clean licence period, and a
        // leftover id would mean their first warning never fires.
        forgetWarnings.accept("business-");

        Optional<Workspace> latest = workspaces.byId(workspace.id());
        Workspace current = latest.orElse(workspace);

        reassigner.reassign(current, profession -> {
            if (profession.isEmpty()) {
                // Nothing could be chosen — no professions configured, or none eligible. The
                // business is released rather than left owned by somebody who no longer has it;
                // an operator rescanning the structure can place a recruiter later.
                plugin.getLogger().warning("Business " + current.id() + " was abandoned but no new"
                        + " profession could be assigned, so it was released. Rescan the structure"
                        + " to place a recruiter.");

                workspaces.release(current);
                return;
            }

            // One write, resetting everything a previous owner built. See Workspace#abandoned for
            // exactly what survives and what does not.
            workspaces.repository().put(current.abandoned(profession.get(), System.currentTimeMillis()));
        });
    }

    /** The id prefix every warning for one business shares, so they can be forgotten together. */
    private static String warningPrefix(Workspace workspace) {
        return "business-licence:" + workspace.id() + ":";
    }
}
