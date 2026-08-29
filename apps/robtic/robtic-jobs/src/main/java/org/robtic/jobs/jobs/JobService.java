package org.robtic.jobs.jobs;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.unlock.AttributeProvider;
import org.robtic.jobs.events.PlayerGainJobEvent;
import org.robtic.jobs.events.PlayerJobLevelUpEvent;
import org.robtic.jobs.events.PlayerJobXpGainEvent;
import org.robtic.jobs.events.PlayerLoseJobEvent;
import org.robtic.jobs.events.PlayerSwitchJobEvent;
import org.robtic.jobs.license.JobLicenseGate;
import org.robtic.jobs.storage.ProgressionRepository;
import org.robtic.core.titles.TitleService;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Taking jobs, leaving them, switching between them and earning in them.
 *
 * <h2>Jobs depend on Titles, and this is where</h2>
 *
 * {@link #checkMilestones} is the only place the two systems touch. It calls
 * {@link TitleService#unlock} with a title id read from the job's configuration. The title service is
 * not told a job was involved beyond a free-text reason string, and nothing in the title system
 * imports anything from this package.
 *
 * <h2>Awarding XP is the hot path</h2>
 *
 * {@link #award} runs on every block a player breaks. It is written to do nothing at all — no
 * allocation, no map building, no event — for the overwhelmingly common case of a player whose
 * active jobs do not reward what they just did. The expensive work happens only when XP is actually
 * earned.
 */
public final class JobService implements AttributeProvider {

    /** Why a claim was refused. Ordered as the spec's validation chain runs. */
    public enum ClaimResult {
        /** Granted. */
        SUCCESS,
        /** No such job is configured. */
        UNKNOWN_JOB,
        /** Their progression is not loaded, so nothing may be written for them. */
        NOT_LOADED,
        /** They already have it. */
        ALREADY_OWNED,
        /** They are at their owned-jobs limit for their premium tier. */
        OWNED_LIMIT_REACHED,
        /** The job carries a permission they lack. */
        NO_PERMISSION,
        /** Another claim for this player is already in flight. */
        IN_PROGRESS,
        /** The job requires a licence the player is not carrying. */
        LICENSE_MISSING,
        /** They hold the licence, but it has lapsed and needs renewing. */
        LICENSE_EXPIRED,
        /** They hold a valid licence and a listener refused this particular use of it. */
        LICENSE_REFUSED,
        /** A listener vetoed it. */
        CANCELLED
    }

    /** Why an activation was refused. */
    public enum SwitchResult {
        SUCCESS,
        UNKNOWN_JOB,
        NOT_OWNED,
        ALREADY_ACTIVE,
        ACTIVE_LIMIT_REACHED,
        NOT_LOADED,
        CANCELLED
    }

    private final Plugin plugin;
    private final JobCatalog catalog;
    private final ProgressionRepository repository;
    private final TitleService titles;
    private volatile JobLimits limits;

    /**
     * The licence check run before a claim commits.
     *
     * Open until the plugin supplies a Core-backed one, so this service is constructible — and
     * testable — with no licence system present. See {@link JobLicenseGate}.
     */
    private volatile JobLicenseGate licenses = JobLicenseGate.OPEN;

    /**
     * Players with a claim in flight.
     *
     * The guard against the spec's "two players click the NPC simultaneously" — or rather against
     * one player's click being processed twice, which is the far commoner version: a double-click, a
     * lag spike, a packet duplicated. Every write path below is already idempotent, so this is belt
     * and braces; but a claim also spawns an NPC and registers a workplace, and doing those twice is
     * visible in a way that a redundant map write is not.
     */
    private final Set<UUID> claiming = ConcurrentHashMap.newKeySet();

    public JobService(
            Plugin plugin,
            JobCatalog catalog,
            ProgressionRepository repository,
            TitleService titles,
            JobLimits limits
    ) {
        this.plugin = plugin;
        this.catalog = catalog;
        this.repository = repository;
        this.titles = titles;
        this.limits = limits;
    }

    public JobCatalog catalog() {
        return catalog;
    }

    public JobLimits limits() {
        return limits;
    }

    /** Replaces the limits after a config reload. */
    public void limits(JobLimits replacement) {
        this.limits = replacement;
    }

    /** Registers the licence gate. Null restores the open one rather than breaking every claim. */
    public void licenses(JobLicenseGate replacement) {
        this.licenses = replacement == null ? JobLicenseGate.OPEN : replacement;
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    public PlayerJobs jobsOf(UUID playerId) {
        return repository.get(playerId).jobs();
    }

    /** The jobs a player owns that still exist in the configuration. */
    public List<Job> ownedJobs(UUID playerId) {
        PlayerJobs jobs = jobsOf(playerId);

        return catalog.all().stream()
                .filter(job -> jobs.owns(job.id()))
                .toList();
    }

    public List<Job> activeJobs(UUID playerId) {
        PlayerJobs jobs = jobsOf(playerId);

        return catalog.all().stream()
                .filter(job -> jobs.isActive(job.id()))
                .toList();
    }

    public Optional<JobProgress> progress(UUID playerId, String jobId) {
        return jobsOf(playerId).progress(jobId);
    }

    /** A player's level in a job, or 0 when they do not have it. */
    public int levelOf(UUID playerId, String jobId) {
        return catalog.job(jobId)
                .flatMap(job -> progress(playerId, jobId).map(p -> p.level(job.curve())))
                .orElse(0);
    }

    // ─── Claiming ─────────────────────────────────────────────────────────────────────────────

    /**
     * Runs the full validation chain and grants the job.
     *
     * The order is the spec's, and the order matters for the message the player sees: they should be
     * told "you already have this job" rather than "you have reached your limit" when both are true,
     * because only one of those is something they can act on.
     *
     * Nothing is written until every check has passed and the event has survived, so a refusal at any
     * point leaves no partial state to clean up.
     */
    public ClaimResult claim(Player player, String jobId, PlayerGainJobEvent.Source source) {
        UUID playerId = player.getUniqueId();

        Optional<Job> found = catalog.job(jobId);

        if (found.isEmpty()) {
            return ClaimResult.UNKNOWN_JOB;
        }

        Job job = found.get();

        if (!repository.isLoaded(playerId)) {
            return ClaimResult.NOT_LOADED;
        }

        // Claimed before any other work so a duplicated interaction cannot get past this point, and
        // released in a finally so a thrown listener cannot lock the player out of ever claiming.
        if (!claiming.add(playerId)) {
            return ClaimResult.IN_PROGRESS;
        }

        try {
            PlayerJobs jobs = jobsOf(playerId);

            if (jobs.owns(job.id())) {
                return ClaimResult.ALREADY_OWNED;
            }

            if (job.permission().filter(node -> !player.hasPermission(node)).isPresent()) {
                return ClaimResult.NO_PERMISSION;
            }

            if (!limits.mayOwnAnother(playerId, jobs)) {
                return ClaimResult.OWNED_LIMIT_REACHED;
            }

            PlayerGainJobEvent event = new PlayerGainJobEvent(playerId, job, source);
            plugin.getServer().getPluginManager().callEvent(event);

            if (event.isCancelled()) {
                return ClaimResult.CANCELLED;
            }

            // The licence is checked after the veto rather than before it, which reads backwards and
            // is not. A licence may be consumable, so the check can spend a single-use item — and
            // nothing may refuse the claim after that point, or the player has paid for a profession
            // they did not get. Running it last makes it the only gate with no gate behind it.
            ClaimResult licensed = licenseCheck(player, job);

            if (licensed != ClaimResult.SUCCESS) {
                return licensed;
            }

            long now = System.currentTimeMillis();

            repository.mutateAndSave(playerId, progression -> {
                PlayerJobs next = progression.jobs().withJob(JobProgress.fresh(job.id(), now));

                // Made active immediately when there is room. A player who has just walked to a
                // guild hall and taken a job expects to start earning, not to discover they must
                // also activate it somewhere.
                if (limits.mayActivateAnother(playerId, next)) {
                    next = next.activating(job.id());
                }

                return progression.withJobs(next);
            });

            // Level 1 milestones are granted here rather than waiting for the first XP tick, so the
            // starter title is on offer the moment the job is taken.
            checkMilestones(playerId, job, 0, levelOf(playerId, job.id()));

            return ClaimResult.SUCCESS;
        } finally {
            claiming.remove(playerId);
        }
    }

    /**
     * Runs the job's licence requirement, if it has one.
     *
     * A job naming no licence passes without the gate being consulted at all, which is what keeps a
     * server that has never configured a licence on exactly the code path it had before licences
     * existed.
     */
    private ClaimResult licenseCheck(Player player, Job job) {
        Optional<String> required = job.license();

        if (required.isEmpty()) {
            return ClaimResult.SUCCESS;
        }

        JobLicenseGate.Decision decision;

        try {
            decision = licenses.check(player, required.get(), "job-claim:" + job.id());
        } catch (RuntimeException failure) {
            // A broken gate refuses rather than waves everybody through. A licence check that fails
            // open is not a licence check, and the alternative — every player claiming every job
            // while an operator works out why — is far worse than a claim that has to be retried.
            plugin.getLogger().warning("The licence check for \"" + job.id() + "\" threw and the"
                    + " claim was refused: " + failure.getMessage());

            return ClaimResult.LICENSE_REFUSED;
        }

        return switch (decision) {
            case ALLOWED -> ClaimResult.SUCCESS;
            case MISSING -> ClaimResult.LICENSE_MISSING;
            case EXPIRED -> ClaimResult.LICENSE_EXPIRED;
            case REFUSED -> ClaimResult.LICENSE_REFUSED;
        };
    }

    /**
     * Resigns from a job.
     *
     * Removes the profession, its XP, its level, its statistics and every title it granted. Keeps
     * money, player level, other titles and everything unrelated — the spec is explicit, and the
     * implementation is deliberately narrow: only {@code jobs} and the recorded job titles are
     * touched, so there is no path by which this can reach anything else.
     *
     * The workplace is not removed here. That belongs to the workplace module, which listens for
     * {@link PlayerLoseJobEvent} — this service has no business knowing what a building is.
     */
    public boolean resign(UUID playerId, String jobId, PlayerLoseJobEvent.Reason reason) {
        Optional<Job> found = catalog.job(jobId);

        if (found.isEmpty() || !repository.isLoaded(playerId)) {
            return false;
        }

        Job job = found.get();
        Optional<JobProgress> progress = progress(playerId, job.id());

        if (progress.isEmpty()) {
            return false;
        }

        PlayerLoseJobEvent event = new PlayerLoseJobEvent(
                playerId, job, progress.get().level(job.curve()), reason);
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return false;
        }

        // Exactly the titles this job handed out, read from the stored record rather than recomputed
        // from the current config — see JobProgress for why that distinction matters.
        for (String titleId : progress.get().unlockedTitles()) {
            titles.revoke(playerId, titleId);
        }

        repository.mutateAndSave(playerId,
                progression -> progression.withJobs(progression.jobs().withoutJob(job.id())));

        return true;
    }

    // ─── Switching ────────────────────────────────────────────────────────────────────────────

    /**
     * Makes an owned job active, deactivating another if the player is at their limit.
     *
     * @param replacing which job to stand down. Required when at the limit; ignored otherwise
     */
    public SwitchResult activate(UUID playerId, String jobId, Optional<String> replacing) {
        Optional<Job> found = catalog.job(jobId);

        if (found.isEmpty()) {
            return SwitchResult.UNKNOWN_JOB;
        }

        if (!repository.isLoaded(playerId)) {
            return SwitchResult.NOT_LOADED;
        }

        Job job = found.get();
        PlayerJobs jobs = jobsOf(playerId);

        if (!jobs.owns(job.id())) {
            return SwitchResult.NOT_OWNED;
        }

        if (jobs.isActive(job.id())) {
            return SwitchResult.ALREADY_ACTIVE;
        }

        Optional<Job> standDown = Optional.empty();

        if (!limits.mayActivateAnother(playerId, jobs)) {
            Optional<String> target = replacing.filter(jobs::isActive);

            if (target.isEmpty()) {
                return SwitchResult.ACTIVE_LIMIT_REACHED;
            }

            standDown = catalog.job(target.get());
        }

        PlayerSwitchJobEvent event =
                new PlayerSwitchJobEvent(playerId, Optional.of(job), standDown);
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return SwitchResult.CANCELLED;
        }

        Optional<Job> deactivating = standDown;

        repository.mutateAndSave(playerId, progression -> {
            PlayerJobs next = progression.jobs();

            // Deactivate first, so the activation always has a free slot and the order of the two
            // operations cannot make a legal switch fail its own limit check.
            if (deactivating.isPresent()) {
                next = next.deactivating(deactivating.get().id());
            }

            return progression.withJobs(next.activating(job.id()));
        });

        return SwitchResult.SUCCESS;
    }

    /** Stands a job down. Its progress is untouched. */
    public boolean deactivate(UUID playerId, String jobId) {
        if (!repository.isLoaded(playerId) || !jobsOf(playerId).isActive(jobId)) {
            return false;
        }

        Optional<Job> job = catalog.job(jobId);

        PlayerSwitchJobEvent event = new PlayerSwitchJobEvent(playerId, Optional.empty(), job);
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return false;
        }

        repository.mutate(playerId,
                progression -> progression.withJobs(progression.jobs().deactivating(jobId)));

        return true;
    }

    // ─── Earning ──────────────────────────────────────────────────────────────────────────────

    /**
     * Awards XP for something a player did, to every active job that rewards it.
     *
     * <h2>Inactive jobs earn nothing</h2>
     *
     * Deliberate and load-bearing: it is what the active limit actually restricts. An inactive job
     * keeps everything it has and gains nothing more.
     *
     * <h2>The fast path</h2>
     *
     * A player with no active jobs, or whose jobs do not reward this action, exits after a map
     * lookup per active job and allocates nothing. That is the case on the overwhelming majority of
     * block breaks, and it is why {@link Job#xpFor} returns an Optional over a pre-built map rather
     * than doing any work of its own.
     *
     * @return whether any XP was awarded, so a caller can skip its own follow-up work
     */
    public boolean award(Player player, JobAction action) {
        UUID playerId = player.getUniqueId();

        if (!repository.isLoaded(playerId)) {
            return false;
        }

        PlayerJobs jobs = jobsOf(playerId);

        if (jobs.activeCount() == 0) {
            return false;
        }

        boolean awarded = false;

        for (String jobId : jobs.active()) {
            Optional<Job> found = catalog.job(jobId);

            if (found.isEmpty()) {
                continue;
            }

            Job job = found.get();
            Optional<Double> reward = job.xpFor(action);

            if (reward.isEmpty()) {
                continue;
            }

            awarded |= grant(playerId, job, action, Math.round(reward.get()));
        }

        return awarded;
    }

    /**
     * Adds XP to one job and reacts to any level-up it caused.
     *
     * The before-and-after levels are computed around the mutation rather than tracked, which is what
     * makes an award crossing several thresholds produce one event describing the whole jump instead
     * of a sequence of single steps that a listener would have to reassemble.
     */
    private boolean grant(UUID playerId, Job job, JobAction action, long xp) {
        if (xp <= 0L) {
            return false;
        }

        long awarded = announceXp(playerId, job, action, xp);

        if (awarded <= 0L) {
            // Cancelled, or scaled to nothing by a listener. The action is still counted nowhere and
            // no level can have changed, so there is nothing else to do.
            return false;
        }

        int before = levelOf(playerId, job.id());
        long now = System.currentTimeMillis();

        repository.mutate(playerId, progression -> {
            Optional<JobProgress> current = progression.jobs().progress(job.id());

            if (current.isEmpty()) {
                return progression;
            }

            JobProgress next = current.get()
                    .plusXp(awarded, now)
                    .counting(action.key(), 1L);

            return progression.withJobs(progression.jobs().withProgress(next));
        });

        int after = levelOf(playerId, job.id());

        if (after > before) {
            plugin.getServer().getPluginManager()
                    .callEvent(new PlayerJobLevelUpEvent(playerId, job, before, after));

            checkMilestones(playerId, job, before, after);
        }

        return true;
    }

    /**
     * Fires {@link PlayerJobXpGainEvent} and reports how much XP survived it.
     *
     * <h2>The listener check is the whole point</h2>
     *
     * This sits in the hottest path the plugin has — every block a player breaks, for every active
     * job that rewards it. With nothing subscribed it returns the amount unchanged after a single
     * static boolean read, allocating nothing and touching no event bus. The multiplier, the boost
     * and the reputation bonus that future phases will want are then a listener away rather than a
     * change here, which is the reason the seam exists at all.
     *
     * @return the amount to actually award, or zero when a listener cancelled it. A listener that
     *         sets a negative amount is treated as cancelling, because nothing in the design takes
     *         XP away and {@code JobProgress} would ignore it anyway
     */
    private long announceXp(UUID playerId, Job job, JobAction action, long xp) {
        if (!PlayerJobXpGainEvent.hasListeners()) {
            return xp;
        }

        PlayerJobXpGainEvent event = new PlayerJobXpGainEvent(playerId, job, action, xp);
        plugin.getServer().getPluginManager().callEvent(event);

        return event.isCancelled() ? 0L : Math.max(0L, event.getAmount());
    }

    /**
     * Grants every milestone title the player has now reached and does not already own.
     *
     * Sweeps the whole range up to their level rather than only the levels just crossed. That makes
     * it self-repairing: a title missed because the API was down, because a listener cancelled it, or
     * because it was added to the config after the player passed its level, is picked up on their
     * next level-up rather than being lost permanently. {@link TitleService#unlock} is idempotent, so
     * the sweep costs a set lookup per milestone and grants nothing twice.
     */
    private void checkMilestones(UUID playerId, Job job, int fromLevel, int toLevel) {
        if (toLevel <= 0) {
            return;
        }

        for (Map.Entry<Integer, String> milestone : job.milestonesUpTo(toLevel).entrySet()) {
            String titleId = milestone.getValue();

            boolean granted = titles.unlock(playerId, titleId,
                    "job:" + job.id() + ":level:" + milestone.getKey());

            if (!granted) {
                continue;
            }

            // Recorded on the job so resignation can take back precisely what this job gave.
            repository.mutate(playerId, progression -> progression.jobs().progress(job.id())
                    .map(progress -> progression.withJobs(
                            progression.jobs().withProgress(progress.withUnlockedTitle(titleId))))
                    .orElse(progression));
        }
    }

    // ─── Attributes ───────────────────────────────────────────────────────────────────────────

    /**
     * Publishes job numbers so titles — and anything else — can gate on them without importing this.
     *
     * <pre>
     *   job.&lt;id&gt;.level    level in a job, 0 when not owned
     *   job.&lt;id&gt;.xp       total XP in a job
     *   job.owned          how many jobs are held
     *   job.active         how many are active
     *   job.highest.level  the best level across every owned job
     * </pre>
     *
     * A title reading {@code job.miner.level} is how "Miner level 10" is expressed with no coupling
     * in either direction. See {@link AttributeProvider}.
     */
    @Override
    public String namespace() {
        return "job";
    }

    @Override
    public OptionalDouble number(UUID playerId, String path) {
        PlayerJobs jobs = jobsOf(playerId);

        switch (path) {
            case "owned" -> {
                return OptionalDouble.of(jobs.ownedCount());
            }
            case "active" -> {
                return OptionalDouble.of(jobs.activeCount());
            }
            case "highest.level" -> {
                return OptionalDouble.of(catalog.all().stream()
                        .filter(job -> jobs.owns(job.id()))
                        .mapToInt(job -> levelOf(playerId, job.id()))
                        .max()
                        .orElse(0));
            }
            default -> {
                // Falls through to the per-job forms below.
            }
        }

        int split = path.lastIndexOf('.');

        if (split <= 0) {
            return OptionalDouble.empty();
        }

        String jobId = path.substring(0, split);
        String field = path.substring(split + 1);

        // Absent rather than zero when the job is not owned, so an "at least 0" condition does not
        // pass for someone who has never taken the job. See AttributeProvider.
        Optional<JobProgress> progress = jobs.progress(jobId);

        if (progress.isEmpty()) {
            return OptionalDouble.empty();
        }

        return switch (field) {
            case "level" -> OptionalDouble.of(levelOf(playerId, jobId));
            case "xp" -> OptionalDouble.of(progress.get().totalXp());
            case "active" -> OptionalDouble.of(jobs.isActive(jobId) ? 1 : 0);
            default -> OptionalDouble.empty();
        };
    }

    @Override
    public Optional<String> text(UUID playerId, String path) {
        if (!"first".equals(path)) {
            return Optional.empty();
        }

        return activeJobs(playerId).stream().findFirst().map(Job::id);
    }
}
