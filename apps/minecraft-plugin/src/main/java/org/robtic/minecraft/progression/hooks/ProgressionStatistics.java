package org.robtic.minecraft.progression.hooks;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.robtic.minecraft.progression.events.PlayerGainJobEvent;
import org.robtic.minecraft.progression.events.PlayerJobLevelUpEvent;
import org.robtic.minecraft.progression.events.PlayerUnlockTitleEvent;
import org.robtic.minecraft.progression.workspace.Workspace;
import org.robtic.minecraft.progression.workspace.WorkspaceExtension;
import org.robtic.minecraft.statistics.StatisticsService;

import java.util.List;

/**
 * Records what the progression system does into the statistics system.
 *
 * <h2>Which way the arrow points</h2>
 *
 * Progression depends on statistics; statistics knows nothing about jobs, titles or workspaces. That
 * is the correct direction for core infrastructure, and it is why this class lives here rather than
 * in the statistics module: the module that owns a fact is the module that records it. A statistics
 * package containing a {@code WorkspaceExtension} would have made the foundation depend on one of the
 * things built on it.
 *
 * <h2>No counters are kept here</h2>
 *
 * This class holds no state at all. Every number it produces goes straight to
 * {@link StatisticsService} and is read back from there — by a menu, a placeholder, a badge system or
 * a leaderboard. That is the rule the whole statistics design exists to enforce, and a bridge that
 * cached "workspaces claimed" locally would break it on the first line.
 *
 * <h2>Two seams, no new plumbing</h2>
 *
 * Job and title facts arrive as Bukkit events the progression system already fires. Workspace facts
 * arrive through {@link WorkspaceExtension}, which exists precisely so a system can observe the
 * workspace lifecycle without the workspace package learning about it. Neither needed a new call site
 * inside the systems being observed.
 */
public final class ProgressionStatistics implements Listener, WorkspaceExtension {

    // The ids this bridge writes. Declared in statistics.yml; named here because this is the code
    // that produces them, and a constant is the one place a rename has to be made.
    private static final String WORKSPACES_CLAIMED = "workspaces_claimed";
    private static final String WORKSPACE_UPGRADES = "workspace_upgrades";
    private static final String WORKSPACE_TAX_PAID = "workspace_tax_paid";
    private static final String STRUCTURES_DISCOVERED = "structures_discovered";
    private static final String JOBS_JOINED = "jobs_joined";
    private static final String JOB_LEVELS_GAINED = "job_levels_gained";
    private static final String TITLES_UNLOCKED = "titles_unlocked";

    private final StatisticsService statistics;

    public ProgressionStatistics(StatisticsService statistics) {
        this.statistics = statistics;
    }

    @Override
    public String name() {
        return "statistics";
    }

    // ─── Jobs and titles ──────────────────────────────────────────────────────────────────────

    /**
     * MONITOR, throughout.
     *
     * These events are cancellable, and recording a fact about something that a listener then
     * refused would put a number in the one place the whole server treats as authoritative that
     * describes an event which never happened.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onGainJob(PlayerGainJobEvent event) {
        statistics.increment(event.getPlayerId(), JOBS_JOINED);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onLevelUp(PlayerJobLevelUpEvent event) {
        // Levels gained, not level-ups. A single burst of XP can carry a player through several
        // levels and fires one event; counting the event would report that as one.
        statistics.add(event.getPlayerId(), JOB_LEVELS_GAINED, event.getLevelsGained());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onUnlockTitle(PlayerUnlockTitleEvent event) {
        statistics.increment(event.getPlayerId(), TITLES_UNLOCKED);
    }

    // ─── Workspaces ───────────────────────────────────────────────────────────────────────────

    @Override
    public void onClaimed(Workspace workspace, Player owner) {
        statistics.increment(workspace.owner(), WORKSPACES_CLAIMED);

        // A claim is also the moment a structure stops being undiscovered scenery and becomes
        // somebody's. There is no earlier point that belongs to a player: a structure generates
        // whether or not anybody is looking at it.
        statistics.increment(workspace.owner(), STRUCTURES_DISCOVERED);
    }

    @Override
    public void onUpgraded(Workspace workspace, int from, Player owner) {
        statistics.increment(workspace.owner(), WORKSPACE_UPGRADES);
    }

    @Override
    public void onTaxPaid(Workspace workspace, double amount) {
        // The total paid, not the number of payments. "You have paid 40,000 in maintenance" is the
        // figure a player recognises; how many times they clicked the button is not.
        statistics.addDouble(workspace.owner(), WORKSPACE_TAX_PAID, amount);
    }

    /**
     * Nothing.
     *
     * The workspace panel shows extension lines, and this extension deliberately contributes none.
     * Statistics are shown by whatever displays statistics; a bridge that also drew UI would be two
     * responsibilities in one class and would put a workspace-specific rendering decision in the one
     * place that exists to be domain-agnostic.
     */
    @Override
    public List<String> describe(Workspace workspace) {
        return List.of();
    }
}
