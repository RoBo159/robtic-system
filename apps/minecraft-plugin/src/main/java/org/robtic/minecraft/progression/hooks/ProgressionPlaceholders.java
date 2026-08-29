package org.robtic.minecraft.progression.hooks;

import org.bukkit.OfflinePlayer;
import org.robtic.minecraft.placeholder.RobticPlaceholders;
import org.robtic.minecraft.progression.jobs.Job;
import org.robtic.minecraft.progression.jobs.JobProgress;
import org.robtic.minecraft.progression.jobs.JobService;
import org.robtic.minecraft.progression.titles.Title;
import org.robtic.minecraft.progression.titles.TitleService;

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
 *   %robtic_job_level_&lt;id&gt;%      18           level in a named job, 0 if not owned
 *   %robtic_job_xp_&lt;id&gt;%         4200
 *   %robtic_job_has_&lt;id&gt;%        yes / no
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

    public ProgressionPlaceholders(JobService jobs, TitleService titles) {
        this.jobs = jobs;
        this.titles = titles;
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
                    .map(title -> org.robtic.minecraft.progression.api.Colors.toLegacy(title.color())
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

            default -> null;
        };
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
