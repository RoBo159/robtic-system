package org.robtic.jobs.workspace;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.jobs.market.JobEconomy;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * Recurring maintenance on a workspace.
 *
 * <h2>What unpaid tax does, and what it must never do</h2>
 *
 * It suspends the workspace's NPCs. That is all. It does not delete the workspace, remove ownership,
 * empty the storage or lower the tier — the brief is explicit, and the reasoning is sound: a player
 * who takes a fortnight off should come back to a business that needs paying, not to an empty plot
 * where months of work used to be. A punishment that destroys progress is one players never risk
 * again, which means they never build anything worth taxing.
 *
 * Restoring is therefore always possible and always complete: pay, and the NPCs come straight back
 * because nothing was thrown away.
 *
 * <h2>"Monthly" is whatever the config says</h2>
 *
 * The interval is configured in minutes and defaults to a week. Gameplay can call it monthly; the
 * system has no opinion, which is what lets a server tune the pressure without a release.
 *
 * <h2>Charged lazily, not on a global timer</h2>
 *
 * A timer that swept every workspace on the server would do work proportional to how many exist
 * rather than to how many are being used. Instead each workspace's bill is evaluated when somebody
 * interacts with it, plus one slow background sweep for the ones nobody has touched — which is what
 * actually needs to notice a lapsed workspace.
 */
public final class WorkspaceTaxService {

    private final Plugin plugin;
    private final WorkspaceService workspaces;
    private final MessageCatalog messages;

    private volatile JobEconomy economy = JobEconomy.NONE;

    public WorkspaceTaxService(Plugin plugin, WorkspaceService workspaces, MessageCatalog messages) {
        this.plugin = plugin;
        this.workspaces = workspaces;
        this.messages = messages;
    }

    public void economy(JobEconomy economy) {
        this.economy = economy == null ? JobEconomy.NONE : economy;
    }

    /** What this workspace owes per interval. */
    public double amountFor(Workspace workspace) {
        return workspaces.settings().taxFor(workspace.level());
    }

    /**
     * When the next payment falls due.
     *
     * Measured from the last payment, or from creation when there has never been one — so a freshly
     * claimed workspace gets a full interval before its first bill rather than owing immediately.
     */
    public long dueAt(Workspace workspace) {
        long from = workspace.lastTaxPaidAt() > 0 ? workspace.lastTaxPaidAt() : workspace.createdAt();
        return from + workspaces.settings().taxInterval().toMillis();
    }

    public boolean overdue(Workspace workspace, long now) {
        return workspaces.settings().taxEnabled() && now >= dueAt(workspace);
    }

    /** How long until it falls due, or zero when it already has. */
    public Duration until(Workspace workspace, long now) {
        return Duration.ofMillis(Math.max(0L, dueAt(workspace) - now));
    }

    /**
     * Whether the grace period has run out and services should be suspended.
     *
     * Grace exists so a player who logs in a few hours late finds a warning rather than a dead
     * workspace — the goal is a nudge, not a trap.
     */
    public boolean pastGrace(Workspace workspace, long now) {
        return overdue(workspace, now)
                && now >= dueAt(workspace) + workspaces.settings().taxGrace().toMillis();
    }

    /**
     * Evaluates one workspace's bill and acts on it.
     *
     * Called when a workspace is interacted with, and by the background sweep. Does nothing at all
     * when tax is disabled or the bill is not yet due, which is the overwhelmingly common case.
     */
    public void evaluate(Workspace workspace, long now) {
        if (!workspaces.settings().taxEnabled()) {
            // Switched off after workspaces were already suspended: restore them, rather than leaving
            // them permanently disabled by a rule that no longer exists.
            if (workspace.taxSuspended()) {
                workspaces.suspended(workspace, false);
            }
            return;
        }

        if (!overdue(workspace, now)) {
            return;
        }

        if (pastGrace(workspace, now) && !workspace.taxSuspended()) {
            workspaces.suspended(workspace, true);

            notifyOwner(workspace, "progression.workspace.suspended",
                    "amount", org.robtic.core.util.Robs.format(amountFor(workspace)));
        }
    }

    /**
     * Attempts to collect from the owner.
     *
     * <h2>Once, whatever the player clicks</h2>
     *
     * The charge crosses a network, so a second click arrives long before the first has finished.
     * Without a guard that is two debits for one bill — and unlike a duplicated read, money taken
     * twice cannot be reconciled by looking at the data afterwards. The workspace's operation lock is
     * the same one an upgrade takes, so the two also cannot charge over each other.
     *
     * @param whenDone called on the main thread with whether it was paid
     */
    public void collect(Workspace workspace, java.util.function.Consumer<Boolean> whenDone) {
        String workspaceId = workspace.id();

        if (!workspaces.beginExclusive(workspaceId)) {
            whenDone.accept(false);
            return;
        }

        double amount = amountFor(workspace);

        if (!org.robtic.core.util.Robs.isPositive(amount)) {
            // Free at this tier. Marked paid so the clock restarts rather than the workspace being
            // permanently overdue. No extension notification: nothing was collected, and a system
            // totalling what players have paid should not be told about a payment of zero.
            settle(workspaceId);
            workspaces.endExclusive(workspaceId);
            whenDone.accept(true);
            return;
        }

        UUID owner = workspace.owner();
        String name = Optional.ofNullable(plugin.getServer().getOfflinePlayer(owner).getName())
                .orElse(owner.toString());

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            boolean paid;

            try {
                paid = economy.pay(owner, name, -amount, "workspace-tax:" + workspaceId);
            } catch (RuntimeException failure) {
                // An economy that throws must not leave the lock held, or this workspace could never
                // be paid for again until a restart.
                paid = false;
                plugin.getLogger().warning("The economy failed while collecting workspace tax for "
                        + name + ": " + failure.getMessage());
            }

            boolean settled = paid;

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                workspaces.endExclusive(workspaceId);

                if (settled) {
                    settle(workspaceId);
                    workspaces.taxPaid(workspace, amount);
                }

                whenDone.accept(settled);
            });
        });
    }

    /**
     * Records the payment and lifts the suspension.
     *
     * Reads the workspace back by id rather than working from the caller's snapshot. The snapshot was
     * taken before a network round trip, and writing it back would undo whatever happened meanwhile —
     * which, in the branch where the tier is free, is how the payment this method had just recorded
     * used to be immediately overwritten by a stale copy and the workspace left permanently overdue.
     */
    private void settle(String workspaceId) {
        workspaces.repository()
                .mutate(workspaceId, current -> current.taxPaid(System.currentTimeMillis()))
                .ifPresent(updated -> workspaces.suspended(updated, false));
    }

    /**
     * The background sweep.
     *
     * Deliberately slow — hourly by default — because its only job is to notice workspaces nobody has
     * visited. Anything being used is evaluated on interaction long before this reaches it.
     */
    public void sweep() {
        long now = System.currentTimeMillis();

        for (Workspace workspace : workspaces.repository().all()) {
            try {
                evaluate(workspace, now);
            } catch (RuntimeException failure) {
                plugin.getLogger().warning("Tax evaluation failed for workspace " + workspace.id()
                        + ": " + failure.getMessage());
            }
        }
    }

    /** Tells the owner, when they are online. An offline owner finds out on their next visit. */
    private void notifyOwner(Workspace workspace, String key, Object... placeholders) {
        Player owner = plugin.getServer().getPlayer(workspace.owner());

        if (owner != null) {
            owner.sendMessage(messages.prefixed(key, placeholders));
        }
    }
}
