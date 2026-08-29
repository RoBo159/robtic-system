package org.robtic.jobs.hooks;

import org.bukkit.OfflinePlayer;
import org.robtic.core.placeholder.RobticPlaceholders;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobProgress;
import org.robtic.jobs.jobs.JobService;
import org.robtic.core.titles.Title;
import org.robtic.core.titles.TitleService;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceService;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * The progression system's placeholders, contributed to the plugin's existing expansion.
 *
 * <pre>
 *   %robtic_job%                 Miner        first active job's display name, or "-"
 *   %robtic_job_id%              miner
 *   %robtic_job_level%           18           level in the first active job
 *   %robtic_job_xp%              4200         total XP in it
 *   %robtic_job_xp_next%         800          XP still needed for the next level
 *   %robtic_job_progress%        62           percent through the current level
 *   %robtic_job_max%             100          that job's level cap
 *   %robtic_active_jobs%         Miner, Farmer
 *   %robtic_owned_jobs%          Miner, Farmer, Fisher
 *   %robtic_active_jobs_count%   2
 *   %robtic_owned_jobs_count%    3
 *   %robtic_title%               Stonebreaker coloured, or "-"
 *   %robtic_title_plain%         Stonebreaker no colour codes
 *   %robtic_title_rarity%        Rare
 *   %robtic_titles_owned%        14
 *   %robtic_titles_total%        60           how many exist and are visible
 *
 *   %robtic_workspace%           Miner Workspace  where the first active job's workspace is, or "-"
 *   %robtic_workspace_level%     2            its tier, 0 when there is none
 *   %robtic_workspace_count%     1            how many workspaces are held
 *   %robtic_workspace_limit%     2            how many may be held, at this premium tier
 *
 *   %robtic_job_level_&lt;id&gt;%      18           level in a named job, 0 if not owned
 *   %robtic_job_xp_&lt;id&gt;%         4200
 *   %robtic_job_has_&lt;id&gt;%        yes / no
 *   %robtic_workspace_&lt;id&gt;%      yes / no     whether a workspace is held for that profession
 * </pre>
 *
 * <h2>Registered as an extension rather than as its own expansion</h2>
 *
 * PlaceholderAPI allows one expansion per identifier, and these must live under {@code robtic_}
 * alongside every other placeholder this plugin exposes — a second identifier would mean an operator
 * writing {@code %robtic_robs%} next to {@code %robticjobs_job%}, which is the sort of inconsistency
 * that generates support questions forever.
 *
 * <h2>Every value is a memory read</h2>
 *
 * A tab list resolves these for every player every second. Nothing here touches storage or the
 * network; all of it reads the repository cache, which is what makes that affordable.
 */
public final class ProgressionPlaceholders implements RobticPlaceholders.Extension {

    private static final String UNKNOWN = "-";
    private static final NumberFormat NUMBERS = NumberFormat.getInstance(Locale.ROOT);

    private final JobService jobs;
    private final TitleService titles;
    private final WorkspaceService workspaces;

    public ProgressionPlaceholders(JobService jobs, TitleService titles, WorkspaceService workspaces) {
        this.jobs = jobs;
        this.titles = titles;
        this.workspaces = workspaces;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        if (player == null) {
            return null;
        }

        UUID uuid = player.getUniqueId();

        // The per-job forms are checked first: "job_level_miner" would otherwise fall through the
        // switch below and return the active job's level, silently ignoring the id.
        String perJob = perJob(uuid, key);

        if (perJob != null) {
            return perJob;
        }

        return switch (key) {
            case "job" -> firstActive(uuid).map(Job::display).orElse(UNKNOWN);
            case "job_id" -> firstActive(uuid).map(Job::id).orElse(UNKNOWN);
            case "job_level" -> String.valueOf(firstActive(uuid)
                    .map(job -> jobs.levelOf(uuid, job.id()))
                    .orElse(0));
            case "job_xp" -> String.valueOf(firstActive(uuid)
                    .flatMap(job -> jobs.progress(uuid, job.id()))
                    .map(JobProgress::totalXp)
                    .orElse(0L));
            case "job_xp_next" -> String.valueOf(firstActive(uuid)
                    .flatMap(job -> jobs.progress(uuid, job.id())
                            .map(progress -> job.curve().xpToNextLevel(progress.totalXp())))
                    .orElse(0L));
            case "job_progress" -> String.valueOf(Math.round(100.0d * firstActive(uuid)
                    .flatMap(job -> jobs.progress(uuid, job.id())
                            .map(progress -> job.curve().progressWithinLevel(progress.totalXp())))
                    .orElse(0.0d)));
            case "job_max" -> String.valueOf(firstActive(uuid).map(Job::maxLevel).orElse(0));

            case "active_jobs" -> names(jobs.activeJobs(uuid));
            case "owned_jobs" -> names(jobs.ownedJobs(uuid));
            case "active_jobs_count" -> String.valueOf(jobs.jobsOf(uuid).activeCount());
            case "owned_jobs_count" -> String.valueOf(jobs.jobsOf(uuid).ownedCount());

            case "title" -> titles.equipped(uuid)
                    .map(title -> org.robtic.core.util.Colors.toLegacy(title.color())
                            + title.display())
                    .orElse(UNKNOWN);
            case "title_plain" -> titles.equipped(uuid)
                    .map(Title::display)
                    .map(display -> display.replaceAll("[&§].", ""))
                    .orElse(UNKNOWN);
            case "title_rarity" -> titles.equipped(uuid)
                    .map(title -> title.rarity().display())
                    .orElse(UNKNOWN);
            case "titles_owned" -> String.valueOf(titles.titlesOf(uuid).owned().size());
            case "titles_total" -> NUMBERS.format(titles.catalog().titles().size());

            case "workspace" -> activeWorkspace(uuid)
                    .map(workspace -> jobs.catalog().job(workspace.professionId())
                            .map(Job::display)
                            .orElse(workspace.professionId()))
                    .orElse(UNKNOWN);
            case "workspace_level" -> String.valueOf(
                    activeWorkspace(uuid).map(Workspace::level).orElse(0));
            case "workspace_count" -> String.valueOf(workspaces.ownedBy(uuid).size());
            case "workspace_limit" -> String.valueOf(workspaces.limitFor(uuid));

            // ─── Business ─────────────────────────────────────────────────────────────────────
            //
            // The business vocabulary for the same workspace the forms above report on. Both sets
            // exist because both are in use: `workspace_level` predates this system and is on
            // people's scoreboards, and breaking it to rename a concept would be a poor trade.

            case "business_base_level" -> String.valueOf(
                    activeWorkspace(uuid).map(Workspace::level).orElse(0));

            case "business_base_max" -> String.valueOf(workspaces.settings().maxBaseLevel());

            case "business_base_name" -> activeWorkspace(uuid)
                    .map(workspace -> workspaces.baseOf(workspace).display())
                    .orElse(UNKNOWN);

            case "business_workers" -> String.valueOf(activeWorkspace(uuid)
                    .map(workspace -> workspace.npcWorkers().size() + workspace.playerWorkers().size())
                    .orElse(0));

            case "business_npc_workers" -> String.valueOf(activeWorkspace(uuid)
                    .map(workspace -> workspace.npcWorkers().size())
                    .orElse(0));

            case "business_player_workers" -> String.valueOf(activeWorkspace(uuid)
                    .map(workspace -> workspace.playerWorkers().size())
                    .orElse(0));

            case "business_worker_limit" -> String.valueOf(activeWorkspace(uuid)
                    .map(workspace -> workspaces.baseOf(workspace).totalWorkers())
                    .orElse(0));

            /*
             * How long the Workspace Licence has left.
             *
             * Three distinct answers, and they are worth keeping distinct on a scoreboard:
             * "Unknown" means nobody has been able to read the licence yet, "Expired" means the
             * grace period is running, and a duration means it is fine. Collapsing the first into
             * the second would tell a player their business is dying when it is not.
             */
            case "business_license_remaining" -> activeWorkspace(uuid)
                    .map(workspace -> {
                        if (workspace.licenseExpiresAt() <= 0L) {
                            return UNKNOWN;
                        }

                        long remaining = workspace.licenseRemaining(System.currentTimeMillis());

                        return remaining <= 0L
                                ? "Expired"
                                : org.robtic.core.util.Durations.format(remaining);
                    })
                    .orElse(UNKNOWN);

            case "business_suspended" -> activeWorkspace(uuid)
                    .map(workspace -> workspaces.suspended(workspace) ? "yes" : "no")
                    .orElse(UNKNOWN);

            default -> null;
        };
    }

    /**
     * The workspace the unqualified forms report on.
     *
     * The one for the first active job, falling back to any workspace the player owns. The fallback
     * matters more than it looks: a player whose active job has no workspace — an event job, or one
     * they have switched to — would otherwise see "-" while standing in a mine they own.
     */
    private Optional<Workspace> activeWorkspace(UUID uuid) {
        Optional<Workspace> forActive = firstActive(uuid)
                .flatMap(job -> workspaces.ownedBy(uuid, job.id()));

        return forActive.isPresent()
                ? forActive
                : workspaces.ownedBy(uuid).stream().findFirst();
    }

    /**
     * Resolves the forms that name a job, e.g. {@code job_level_miner}.
     *
     * The id is taken as everything after the prefix, so a job called {@code deep_miner} works —
     * splitting on the last underscore instead would resolve it as the job {@code deep} and would be
     * a genuinely confusing failure to diagnose.
     */
    private String perJob(UUID uuid, String key) {
        if (key.startsWith("job_level_")) {
            return String.valueOf(jobs.levelOf(uuid, key.substring("job_level_".length())));
        }

        if (key.startsWith("job_xp_") && !key.equals("job_xp_next")) {
            String jobId = key.substring("job_xp_".length());
            return String.valueOf(jobs.progress(uuid, jobId).map(JobProgress::totalXp).orElse(0L));
        }

        if (key.startsWith("job_has_")) {
            return jobs.jobsOf(uuid).owns(key.substring("job_has_".length())) ? "yes" : "no";
        }

        // Checked after the three fixed workspace_* forms are excluded, so "workspace_level" is not
        // read as "do you own a workspace for the profession called level".
        if (key.startsWith("workspace_")
                && !key.equals("workspace_level")
                && !key.equals("workspace_count")
                && !key.equals("workspace_limit")) {

            return workspaces.ownedBy(uuid, key.substring("workspace_".length())).isPresent()
                    ? "yes"
                    : "no";
        }

        return null;
    }

    /** The job whose numbers the unqualified placeholders report. */
    private Optional<Job> firstActive(UUID uuid) {
        return jobs.activeJobs(uuid).stream().findFirst();
    }

    private static String names(java.util.List<Job> list) {
        return list.isEmpty()
                ? UNKNOWN
                : list.stream().map(Job::display).reduce((a, b) -> a + ", " + b).orElse(UNKNOWN);
    }
}
