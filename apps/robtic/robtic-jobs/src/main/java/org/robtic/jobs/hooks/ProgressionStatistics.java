package org.robtic.jobs.hooks;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.robtic.jobs.events.PlayerGainJobEvent;
import org.robtic.jobs.events.PlayerJobLevelUpEvent;
import org.robtic.jobs.events.PlayerSellItemsEvent;
import org.robtic.core.titles.events.PlayerUnlockTitleEvent;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceExtension;
import org.robtic.core.statistics.StatisticsService;

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
    private static final String ITEMS_SOLD = "items_sold";
    private static final String DAILY_ITEMS_SOLD = "daily_items_sold";
    private static final String ROBS_EARNED = "robs_earned";
    private static final String DAILY_ROBS_EARNED = "daily_robs_earned";

    // ─── Business ─────────────────────────────────────────────────────────────────────────────

    private static final String BUSINESSES_OWNED = "businesses_owned";
    private static final String BUSINESSES_LOST = "businesses_lost";
    private static final String BUSINESSES_ABANDONED = "businesses_abandoned";
    private static final String BUSINESS_BASE_LEVELS = "business_base_levels";
    private static final String BUSINESS_LIFETIME = "business_lifetime";
    private static final String WORKERS_HIRED = "workers_hired";
    private static final String NPC_WORKERS_PURCHASED = "npc_workers_purchased";
    private static final String PLAYER_WORKERS_HIRED = "player_workers_hired";

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

    /**
     * Selling, which is four figures rather than one.
     *
     * The lifetime and daily counters are separate statistics because they reset on different
     * schedules — {@code statistics.yml} marks the daily pair {@code reset: daily} — and deriving one
     * from the other is not possible in either direction once a reset has happened.
     *
     * The event is not cancellable and fires only after payment has confirmed, so there is no
     * {@code ignoreCancelled} to set and no sale counted here that did not actually happen.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onSell(PlayerSellItemsEvent event) {
        statistics.add(event.getPlayerId(), ITEMS_SOLD, event.getTotal());
        statistics.add(event.getPlayerId(), DAILY_ITEMS_SOLD, event.getTotal());

        // Both declared as long in statistics.yml, so the payment is rounded to whole robs rather
        // than written through addDouble — which would store a fraction the definition cannot render.
        long earned = Math.round(event.getPaid());

        if (earned > 0L) {
            statistics.add(event.getPlayerId(), ROBS_EARNED, earned);
            statistics.add(event.getPlayerId(), DAILY_ROBS_EARNED, earned);
        }
    }

    // ─── Workspaces ───────────────────────────────────────────────────────────────────────────

    @Override
    public void onClaimed(Workspace workspace, Player owner) {
        statistics.increment(workspace.owner(), WORKSPACES_CLAIMED);
        statistics.increment(workspace.owner(), BUSINESSES_OWNED);

        // A claim is also the moment a structure stops being undiscovered scenery and becomes
        // somebody's. There is no earlier point that belongs to a player: a structure generates
        // whether or not anybody is looking at it.
        statistics.increment(workspace.owner(), STRUCTURES_DISCOVERED);
    }

    @Override
    public void onUpgraded(Workspace workspace, int from, Player owner) {
        statistics.increment(workspace.owner(), WORKSPACE_UPGRADES);

        // Levels reached, not upgrades bought. They are the same number today and would stop being
        // so the moment a level is ever skipped — by a command, a reward, or a ladder with a gap —
        // and "reached level 8" is the claim a player would make.
        statistics.add(workspace.owner(), BUSINESS_BASE_LEVELS, Math.max(1, workspace.level() - from));
    }

    /**
     * A workspace upgrade, which is not a base level.
     *
     * Counted under the same statistic as base upgrades deliberately: a player thinks of "upgrades
     * bought" as one number, and splitting it would mean neither figure matched what they remember
     * spending.
     */
    @Override
    public void onUpgradeBought(Workspace workspace, String upgradeId, int toLevel, Player owner) {
        statistics.increment(workspace.owner(), WORKSPACE_UPGRADES);
    }

    @Override
    public void onTaxPaid(Workspace workspace, double amount) {
        // The total paid, not the number of payments. "You have paid 40,000 in maintenance" is the
        // figure a player recognises; how many times they clicked the button is not.
        statistics.addDouble(workspace.owner(), WORKSPACE_TAX_PAID, amount);
    }

    /**
     * A business ending, however it ended.
     *
     * <h2>Lifetime is accumulated here, not measured from a field</h2>
     *
     * There is nowhere else it can be: the record that knows when the business started is about to
     * stop existing. Adding it up as each one ends gives a running total across every business a
     * player has ever run, which is the figure that means something — a player who has held four
     * businesses for a month each reads four months, and an age field on the current one could never
     * say that.
     *
     * Minutes rather than millis, because the statistic is rendered to players and a number with
     * thirteen digits is not a duration anybody reads.
     */
    @Override
    public void onReleasing(Workspace workspace) {
        statistics.increment(workspace.owner(), BUSINESSES_LOST);

        long heldFor = System.currentTimeMillis() - workspace.createdAt();

        if (heldFor > 0L) {
            statistics.add(workspace.owner(), BUSINESS_LIFETIME,
                    java.time.Duration.ofMillis(heldFor).toMinutes());
        }
    }

    /**
     * A business lost specifically to a lapsed licence.
     *
     * Recorded in addition to {@code businesses_lost}, never instead of it — see statistics.yml on
     * why the two are kept apart. Called by the lifecycle service rather than through the extension
     * interface, because "abandoned" is a lifecycle outcome and not a workspace event: a resignation
     * and an abandonment both release a workspace, and only one of them is this.
     */
    public void onAbandoned(Workspace workspace) {
        statistics.increment(workspace.owner(), BUSINESSES_ABANDONED);
    }

    /** A worker taken on. Both counters move: one is the total, the other is the breakdown. */
    public void onWorkerHired(Workspace workspace, boolean npcWorker) {
        statistics.increment(workspace.owner(), WORKERS_HIRED);
        statistics.increment(workspace.owner(),
                npcWorker ? NPC_WORKERS_PURCHASED : PLAYER_WORKERS_HIRED);
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
