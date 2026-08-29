package org.robtic.jobs;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.unlock.Attributes;
import org.robtic.core.module.RobticModule;
import org.robtic.core.unlock.UnlockConditions;
import org.robtic.jobs.commands.ProgressionCommands;
import org.robtic.jobs.gui.JobMenu;
import org.robtic.jobs.gui.ProgressionMenuListener;
import org.robtic.jobs.gui.TitleMenu;
import org.robtic.jobs.hooks.ProgressionPlaceholders;
import org.robtic.jobs.hooks.ProgressionStatistics;
import org.robtic.jobs.jobs.JobCatalog;
import org.robtic.jobs.jobs.JobLimits;
import org.robtic.jobs.jobs.JobService;
import org.robtic.jobs.listeners.JobActionListener;
import org.robtic.jobs.listeners.NpcInteractionListener;
import org.robtic.jobs.listeners.ProgressionPlayerListener;
import org.robtic.jobs.market.JobEconomy;
import org.robtic.jobs.market.SellConditions;
import org.robtic.jobs.market.SellQuotas;
import org.robtic.jobs.market.SellService;
import org.robtic.jobs.npc.NpcService;
import org.robtic.jobs.storage.ProgressionRepository;
import org.robtic.jobs.storage.ProgressionStorage;
import org.robtic.core.titles.TitleCatalog;
import org.robtic.core.titles.TitleService;
import org.robtic.jobs.npc.NpcBackend;
import org.robtic.jobs.workspace.DiscoveryService;
import org.robtic.jobs.workspace.WorkspaceController;
import org.robtic.jobs.workspace.WorkspaceMenu;
import org.robtic.jobs.workspace.WorkspaceNpcRole;
import org.robtic.jobs.workspace.WorkspaceRepository;
import org.robtic.jobs.workspace.WorkspaceService;
import org.robtic.jobs.workspace.WorkspaceSettings;
import org.robtic.jobs.workspace.WorkspaceTaxService;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.function.ToIntFunction;

/**
 * Builds and owns every part of the progression system.
 *
 * <h2>The one place the wiring lives</h2>
 *
 * Everything below is constructor injection: no service looks up another, nothing is static, and the
 * dependency direction is visible in one screen. That is what makes the stated goal — moving this
 * into separate plugins later — a matter of moving packages rather than reconstructing a boot
 * sequence spread across a thousand-line main class.
 *
 * <h2>Construction order is a dependency order</h2>
 *
 * <pre>
 *   Attributes ← nothing
 *   TitleCatalog ← UnlockConditions
 *   TitleService ← TitleCatalog, Repository, Attributes
 *   JobCatalog ← TitleCatalog                     (contributes milestone titles into it)
 *   JobService ← JobCatalog, Repository, TitleService
 *   NpcService ← NpcBackend                       (Citizens or the builtin)
 *   WorkspaceService ← WorkspaceRepository, NpcService
 *   Discovery ← NpcService, JobCatalog, WorkspaceService
 * </pre>
 *
 * Titles never point back at jobs, at any level. The one arrow between them runs from JobService to
 * TitleService and carries a title id.
 *
 * <h2>What is injected rather than imported</h2>
 *
 * The premium tier, the tester check and the economy all arrive as functions supplied by the plugin.
 * This package therefore compiles with no reference to the survival module, the Robs service or the
 * premium cache — which is the difference between a module that can be extracted and one that only
 * looks like it can.
 */
public final class ProgressionSystem implements RobticModule {

    private final Plugin plugin;
    private final MessageCatalog messages;

    private final Attributes attributes;
    private final UnlockConditions conditions;
    private final ProgressionRepository repository;

    private final TitleCatalog titleCatalog;
    private final TitleService titleService;

    private final JobCatalog jobCatalog;
    private final JobService jobService;

    private final NpcService npcService;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceService workspaceService;
    private final WorkspaceTaxService taxService;
    private final WorkspaceMenu workspaceMenu;
    private final WorkspaceController workspaceController;

    private final DiscoveryService discoveryService;
    private final org.robtic.jobs.workspace.building.BuildingService buildingService;
    private final org.robtic.jobs.workspace.worker.WorkerService workerService;
    private final org.robtic.jobs.workspace.worker.WorkerYieldService workerYieldService;
    private final org.robtic.jobs.workspace.lifecycle.BusinessLifecycleService lifecycleService;

    /** Which trade an abandoned building takes up next. Rebuilt on reload. */
    private volatile org.robtic.jobs.workspace.lifecycle.ProfessionWeights professionWeights =
            org.robtic.jobs.workspace.lifecycle.ProfessionWeights.empty();

    private final SellQuotas sellQuotas;
    private final SellService sellService;

    private final TitleMenu titleMenu;
    private final JobMenu jobMenu;

    /** Reads the current config files. A supplier so a reload re-reads rather than reusing a copy. */
    private final Supplier<FileConfiguration> jobsConfig;
    private final Supplier<FileConfiguration> npcConfig;
    private final Supplier<FileConfiguration> workspaceConfig;
    private final Supplier<FileConfiguration> workersConfig;

    private final ToIntFunction<UUID> premiumTier;
    private final Predicate<UUID> tester;

    /**
     * Where this system's facts are recorded. Null when no statistics system is running.
     *
     * Not a constructor parameter, because statistics are optional infrastructure and a module that
     * cannot start without them is not optional infrastructure. See {@link #statistics}.
     */
    private org.robtic.core.statistics.StatisticsService statistics;

    /**
     * RobticWorld's marker system. Null when it is not running.
     *
     * Injected rather than looked up for the same reason statistics are: this package should compile
     * and run without it, and a module that cannot start without an optional subsystem is not
     * optional. Must be set before {@link #enable()} — the bridge is registered as a listener there,
     * and registering it afterwards would silently miss every structure generated in between.
     */
    private org.robtic.world.StructureMarkerSystem markers;

    public ProgressionSystem(
            Plugin plugin,
            MessageCatalog messages,
            ProgressionStorage storage,
            // Both owned by RobticCore. Titles are Core infrastructure — a server with no jobs
            // plugin still has them — so this system is handed the running instances rather than
            // building a second pair that would disagree with Core's about what anybody owns.
            TitleCatalog titleCatalog,
            TitleService titleService,
            Attributes attributes,
            UnlockConditions conditions,
            Supplier<FileConfiguration> jobsConfig,
            Supplier<FileConfiguration> npcConfig,
            Supplier<FileConfiguration> workspaceConfig,
            Supplier<FileConfiguration> workersConfig,
            ToIntFunction<UUID> premiumTier,
            Predicate<UUID> tester
    ) {
        this.plugin = plugin;
        this.messages = messages;
        this.jobsConfig = jobsConfig;
        this.npcConfig = npcConfig;
        this.workspaceConfig = workspaceConfig;
        this.workersConfig = workersConfig;
        this.premiumTier = premiumTier;
        this.tester = tester;

        this.attributes = attributes;
        this.conditions = conditions;
        this.repository = new ProgressionRepository(plugin, storage);

        this.titleCatalog = titleCatalog;
        this.titleService = titleService;

        this.jobCatalog = new JobCatalog(plugin.getLogger(), titleCatalog);
        this.jobService = new JobService(plugin, jobCatalog, repository, titleService,
                new JobLimits(new JobLimits.Limit(1, 1), Map.of(), premiumTier, tester));

        // The NPC backend is chosen here rather than inside NpcService, so the choice is visible in
        // the wiring alongside everything else it affects.
        this.npcService = new NpcService(plugin,
                NpcBackend.create(plugin, npcConfig.get().getString("backend", "auto")));

        // The settings object is not kept as a field. WorkspaceService owns the current one and every
        // reader goes through it, so a second copy here could only ever be a stale one that disagrees.
        this.workspaceRepository = new WorkspaceRepository(plugin, storage);
        this.workspaceService = new WorkspaceService(
                plugin, workspaceRepository, npcService,
                new WorkspaceSettings(
                        workspaceConfig.get().getConfigurationSection("workspace"),
                        conditions, plugin.getLogger()),
                premiumTier);

        // Base levels may gate themselves on anything Core publishes an attribute for — a profession
        // level, a reputation, a statistic. The router is handed over here rather than resolved
        // inside the service, so the workspace package keeps depending on the contract and not on
        // however Core happens to assemble it.
        this.workspaceService.attributes(attributes);

        this.taxService = new WorkspaceTaxService(plugin, workspaceService, messages);
        this.discoveryService = new DiscoveryService(plugin, jobCatalog, npcService, workspaceService);

        // Replacing the building when a base level is reached. Optional in every sense: without a
        // paste backend the service reports that it did nothing, and base levels still unlock
        // everything they unlock.
        this.buildingService = new org.robtic.jobs.workspace.building.BuildingService(
                plugin,
                new org.robtic.jobs.workspace.building.WorldEditSchematicPaster(plugin),
                plugin.getDataFolder().toPath().resolve("schematics"));

        this.workspaceService.paster(buildingService);

        // Employees. The settings are rebuilt on reload and handed to both services, so a yield
        // table edit takes effect without a restart and neither service can hold a stale copy.
        org.robtic.jobs.workspace.worker.WorkerSettings workerSettings =
                new org.robtic.jobs.workspace.worker.WorkerSettings(
                        workersConfig.get().getConfigurationSection("workers"), plugin.getLogger());

        this.workerService = new org.robtic.jobs.workspace.worker.WorkerService(
                plugin, workspaceService, npcService, workerSettings);

        this.workerYieldService = new org.robtic.jobs.workspace.worker.WorkerYieldService(
                plugin, workspaceService, workerService, workerSettings);

        // An NPC worker may only be bound to a profession that exists. Supplied as a predicate for
        // the same reason the storage filter is: the worker package never learns that jobs exist.
        this.workerService.professions(professionId -> jobCatalog.job(professionId).isPresent());

        this.lifecycleService = new org.robtic.jobs.workspace.lifecycle.BusinessLifecycleService(
                plugin, workspaceService, workerService);

        // How an abandoned building finds its next trade. Assembled here because it is the one place
        // that can see all three parts — the weights, the profession catalogue and the recruiter
        // spawner — while none of them has to learn about the others.
        this.lifecycleService.reassigner((workspace, whenDone) -> {
            java.util.Optional<String> profession =
                    professionWeights.roll(workspace.professionId());

            if (profession.isEmpty()) {
                whenDone.accept(java.util.Optional.empty());
                return;
            }

            // The recruiter is placed before the caller resets the record, so a failure to place one
            // is reported against a business that still describes itself properly.
            boolean placed = discoveryService.placeRecruiter(
                    profession.get(), workspace.structureId(), workspace.anchor());

            if (!placed) {
                plugin.getLogger().warning("Business " + workspace.id() + " was abandoned and"
                        + " reassigned to \"" + profession.get() + "\", but its recruiter could not"
                        + " be placed. The building is unclaimable until a \"/structure marker scan\""
                        + " nearby, or a restart, tries again.");
            }

            whenDone.accept(profession);
        });

        this.sellQuotas = new SellQuotas();
        this.sellService = new SellService(plugin, jobService, attributes, sellQuotas);

        this.titleMenu = new TitleMenu(titleService, messages);
        this.jobMenu = new JobMenu(jobService, titleService, workspaceService, sellService, messages);

        this.workspaceMenu = new WorkspaceMenu(workspaceService, taxService, messages);

        // What a workspace will accept into storage is a job's price list — so the filter is a
        // function of profession id, and the workspace never learns that jobs exist.
        this.workspaceController = new WorkspaceController(
                plugin, workspaceService, taxService, workspaceMenu, messages,
                professionId -> jobCatalog.job(professionId)
                        .map(job -> job.prices().keySet())
                        .orElse(java.util.Set.of()));
    }

    @Override
    public String name() {
        return "progression";
    }

    // ─── Accessors, for the plugin's own wiring ───────────────────────────────────────────────

    public TitleService titles() {
        return titleService;
    }

    public JobService jobs() {
        return jobService;
    }

    public ProgressionRepository repository() {
        return repository;
    }

    public Attributes attributes() {
        return attributes;
    }

    public UnlockConditions conditions() {
        return conditions;
    }

    public SellService sell() {
        return sellService;
    }

    public WorkspaceService workspaces() {
        return workspaceService;
    }

    public NpcService npcs() {
        return npcService;
    }

    /**
     * Registers the economy. Separate from construction because it comes from the survival module.
     *
     * Handed to every service that charges or pays, not only the sell flow. Missing one of them is
     * not a partial failure that degrades gracefully: {@link JobEconomy#NONE} refuses every payment,
     * so a workspace service left on the default can never take an upgrade fee and — far worse — a
     * tax service left on it can never accept a tax payment, which suspends workspaces permanently.
     */
    public void economy(JobEconomy economy) {
        sellService.economy(economy);
        workspaceService.economy(economy);
        taxService.economy(economy);
    }

    /**
     * Records this system's facts into the statistics system.
     *
     * Optional and injected rather than looked up, so the progression package compiles and runs with
     * no statistics system present — which is what makes "statistics is infrastructure everything
     * uses" true rather than "statistics is a hard dependency everything has".
     *
     * Must be called before {@link #enable()}: the bridge is registered as a workspace extension and
     * a Bukkit listener there, and registering it afterwards would silently miss everything that
     * happened in between.
     */
    public void statistics(org.robtic.core.statistics.StatisticsService statistics) {
        this.statistics = statistics;
    }

    /**
     * Registers RobticWorld's marker system, which is how structures reach this plugin.
     *
     * Must be called before {@link #enable()}. See {@link #markers}.
     */
    public void markers(org.robtic.world.StructureMarkerSystem markers) {
        this.markers = markers;
    }

    /** The placeholder extension, for registering with the plugin's existing expansion. */
    public ProgressionPlaceholders placeholders() {
        return new ProgressionPlaceholders(jobService, titleService, workspaceService);
    }

    /**
     * Registers the licence gate that claims are checked against.
     *
     * Optional and injected for the same reason statistics are: RobticCore's licence system can fail
     * to start, and a profession system that could not run without it would make an optional
     * subsystem a hard dependency of the whole plugin. Left unset, {@code JobLicenseGate.OPEN} runs
     * and every job that names no licence — which is all of them by default — behaves identically.
     */
    public void licenses(org.robtic.jobs.license.JobLicenseGate gate) {
        jobService.licenses(gate);

        // The same gate serves three purposes now: claiming a profession, hiring a worker (the
        // Manager Licence) and reading a business's operating licence for the lifecycle sweep. One
        // seam rather than three, so a server without Core's licence system has all three open
        // rather than two open and one silently destroying businesses.
        workerService.licences(gate);
        lifecycleService.licences(gate);
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    @Override
    public void enable() {
        // The job service publishes job.* attributes, which the unlock conditions read. Registered
        // before configs load so a title parsed at load can already resolve its condition path.
        attributes.register(jobService);

        loadConfiguration();

        // Creates the schematic directory and says once which paste backend, if any, is in use.
        buildingService.prepare();

        // The seller and upgrade NPCs both open the workspace panel. Registered as role handlers
        // rather than special-cased in the interaction listener, so a future contract or event NPC
        // plugs in exactly the same way — see WorkspaceNpcRole.Handler.
        workspaceService.handler(WorkspaceNpcRole.SELLER, workspaceController::openFromNpc);
        workspaceService.handler(WorkspaceNpcRole.UPGRADE, workspaceController::openFromNpc);
        workspaceService.handler(WorkspaceNpcRole.MANAGER, workspaceController::openFromNpc);

        // A job may name its own seller NPC — a Fishmonger rather than the generic Buyer. Supplied as
        // a function for the same reason the storage filter is: the workspace package never learns
        // that jobs exist, it just asks what NPC this profession wants for this role.
        workspaceService.npcOverride((professionId, roleId) ->
                WorkspaceNpcRole.SELLER.equals(roleId)
                        ? jobCatalog.job(professionId).flatMap(job -> job.workspace().sellerNpc())
                        : java.util.Optional.empty());

        // Workspaces load asynchronously. Protection denies everyone until they arrive — see
        // WorkspaceRepository — and every workspace is restaffed once they have, which repairs NPCs
        // lost to a crash, a chunk purge or a backend switch.
        workspaceRepository.load(() -> {
            workspaceService.repairAll();

            // Worker figures are repaired in the same pass and for the same reasons — a crash, a
            // chunk purge, an operator removing one by hand. Done after the role NPCs so a business
            // whose whole staff vanished comes back in a sensible order.
            workspaceRepository.all().forEach(workerService::repair);
        });

        // Workers produce on elapsed time, so this only has to notice that an interval has passed.
        // A minute is far more often than necessary and costs a map walk; the alternative — running
        // it exactly on the yield interval — makes a restart lose up to a full interval's timing.
        workerYieldService.start(1_200L);

        // Notifications reach players through Core. Resolved here rather than held from construction
        // because Core may publish it after this plugin enables, and NONE is a working answer either
        // way — a business simply warns nobody.
        org.robtic.core.service.RobticServices
                .find(org.robtic.core.notify.NotificationService.class)
                .ifPresent(lifecycleService::notifications);

        // Lets a renewal clear the warnings already sent, so a licence renewed and left to lapse a
        // second time warns again. Only the dispatcher can do this, and only Core has one.
        org.robtic.core.service.RobticServices
                .find(org.robtic.core.notify.NotificationSystem.class)
                .ifPresent(system -> lifecycleService.forgetWarnings(
                        prefix -> system.dispatcher().forgetPrefix(prefix)));

        // Deliberately slow. Anything a player is using is evaluated when they touch it — see
        // BusinessLifecycleService#observe — so this only has to catch businesses nobody visits.
        // Five minutes is far tighter than the shortest warning threshold and costs a map walk.
        lifecycleService.start(6_000L);

        // One object serving as both a workspace extension and a Bukkit listener, because it is one
        // responsibility: everything this system does that is worth counting, counted in the one
        // place the server treats as authoritative. See ProgressionStatistics.
        if (statistics != null) {
            ProgressionStatistics recorder = new ProgressionStatistics(statistics);

            workspaceService.register(recorder);
            plugin.getServer().getPluginManager().registerEvents(recorder, plugin);

            // Two facts the extension interface cannot carry: hiring is not a workspace event, and
            // abandonment is a lifecycle outcome rather than a release — a resignation releases a
            // workspace too, and only one of the two is an abandonment.
            workerService.onHired(recorder::onWorkerHired);
            lifecycleService.onAbandoned(recorder::onAbandoned);
        }

        registerListeners();
        registerCommands();

        // The tax sweep. Deliberately slow: anything a player is using is evaluated on interaction
        // long before this reaches it, so its only job is to notice workspaces nobody has visited.
        //
        // Scheduled unconditionally rather than only when tax is enabled at boot. A timer can only be
        // registered during enable, so gating it on the current setting meant switching tax on with a
        // reload produced a system that never swept — and switching it off left every suspended
        // workspace suspended forever, because the sweep is also what restores them. The sweep itself
        // does nothing when tax is disabled beyond that restoration; see WorkspaceTaxService#evaluate.
        long sweepTicks = Math.max(6000L,
                workspaceConfig.get().getLong("workspace.tax.sweep-minutes", 60L) * 1200L);

        plugin.getServer().getScheduler()
                .runTaskTimer(plugin, taxService::sweep, sweepTicks, sweepTicks);

        // A periodic flush so XP earned between the significant events is not lost to a crash.
        long flushTicks = Math.max(200L, jobsConfig.get().getLong("save-interval-seconds", 300L) * 20L);

        plugin.getServer().getScheduler().runTaskTimer(plugin, repository::flush, flushTicks, flushTicks);

        // Players already online when the plugin enables — a /reload, or a late enable — would
        // otherwise have no progression loaded and silently earn nothing.
        for (org.bukkit.entity.Player online : plugin.getServer().getOnlinePlayers()) {
            repository.load(online.getUniqueId(),
                    progression -> titleService.applyDisplay(online.getUniqueId()));
        }

        plugin.getLogger().info("Progression enabled: " + jobCatalog.jobs().size() + " job(s), "
                + titleCatalog.titles().size() + " title(s), storage = " + repository.backend() + ".");
    }

    @Override
    public void reload() {
        loadConfiguration();
    }

    /**
     * Re-reads every progression config.
     *
     * <h2>Titles are loaded by RobticCore, and contributed to from here</h2>
     *
     * {@link JobCatalog} contributes milestone titles into Core's catalog, and Core's own load clears
     * that catalog first. In the monolith both happened in this method and the order was the whole
     * comment; across two plugins the ordering is guaranteed by load order instead — Core enables
     * first and loads titles, then this plugin enables and contributes.
     *
     * The hazard that remains: reloading Core's titles WITHOUT reloading this plugin drops every job
     * milestone title until this plugin reloads too. Reload both, or restart.
     */
    private void loadConfiguration() {
        FileConfiguration jobsFile = jobsConfig.get();

        jobCatalog.load(jobsFile);
        npcService.load(npcConfig.get());

        jobService.limits(JobLimits.parse(
                jobsFile.getConfigurationSection("limits"), premiumTier, tester, plugin.getLogger()));

        sellService.conditions(sellConditions(jobsFile));

        sellQuotas.zone(zone(jobsFile.getString("quota-timezone", "UTC")));

        discoveryService.configure(
                jobsFile.getBoolean("discovery.enabled", true),
                Set.copyOf(jobsFile.getStringList("discovery.worlds")));

        // Which marker NPC roles this plugin treats as recruiters. Left unset, the shipped pair is
        // used — see DiscoveryService#DEFAULT_RECRUITER_ROLES.
        discoveryService.recruiterRoles(Set.copyOf(
                jobsFile.getStringList("discovery.recruiter-roles")));

        // Rebuilt wholesale and handed to the service, so a reload cannot leave it reading a mix of
        // old and new tiers. Existing workspaces keep their level; only what a level *means* changes.
        workspaceService.settings(new WorkspaceSettings(
                workspaceConfig.get().getConfigurationSection("workspace"),
                conditions, plugin.getLogger()));

        // Both worker services share one settings object, for the same reason: two copies is how a
        // yield table edit takes effect in the tick and not in the menu that explains it.
        org.robtic.jobs.workspace.worker.WorkerSettings workerSettings =
                new org.robtic.jobs.workspace.worker.WorkerSettings(
                        workersConfig.get().getConfigurationSection("workers"), plugin.getLogger());

        workerService.settings(workerSettings);
        workerYieldService.settings(workerSettings);

        buildingService.reload();

        // A base level's worker limits cannot legally fall, but an operator can still lower one on a
        // running server. Reconciled deliberately here rather than left as businesses quietly over
        // their limit that nothing would ever correct.
        workspaceRepository.all().forEach(workerService::trimToLimits);

        // Which trade an abandoned building takes up next. Validated against the job catalogue as it
        // is read, so a weight naming a profession that was renamed is reported rather than silently
        // making the roll less likely to pick anything.
        professionWeights = org.robtic.jobs.workspace.lifecycle.ProfessionWeights.parse(
                workspaceConfig.get().getConfigurationSection("workspace.abandonment.professions"),
                professionId -> jobCatalog.job(professionId).isPresent(),
                plugin.getLogger());
    }

    /** Per-job sell requirements, parsed through the shared condition system. */
    private Map<String, SellConditions> sellConditions(FileConfiguration jobsFile) {
        Map<String, SellConditions> parsed = new LinkedHashMap<>();

        var section = jobsFile.getConfigurationSection("jobs");

        if (section == null) {
            return parsed;
        }

        for (String jobId : section.getKeys(false)) {
            var body = section.getConfigurationSection(jobId);

            if (body == null) {
                continue;
            }

            parsed.put(org.robtic.core.util.Ids.normalise(jobId),
                    SellConditions.parse(body.getConfigurationSection("sell"), conditions,
                            "jobs.yml → " + jobId + " → sell"));
        }

        return parsed;
    }

    /** A bad timezone falls back to UTC rather than throwing during a reload. */
    private ZoneId zone(String raw) {
        try {
            return ZoneId.of(raw);
        } catch (RuntimeException unknown) {
            plugin.getLogger().warning("jobs.yml names the unknown timezone \"" + raw + "\". Using UTC.");
            return ZoneId.of("UTC");
        }
    }

    private void registerListeners() {
        var manager = plugin.getServer().getPluginManager();

        // Not a Bukkit listener: it registers with the NPC backend, because some backends' NPCs are
        // packets and never raise an interact event. See NpcInteractionListener.
        new NpcInteractionListener(
                plugin, npcService, jobService, workspaceService, discoveryService, messages).register();

        manager.registerEvents(new JobActionListener(plugin, jobService), plugin);
        manager.registerEvents(
                new org.robtic.jobs.workspace.WorkspaceProtectionListener(
                        workspaceService, messages), plugin);
        manager.registerEvents(new ProgressionPlayerListener(
                plugin, repository, titleService, workspaceService, sellQuotas,
                lifecycleService), plugin);

        // The one join with RobticWorld's marker system. Absent only when that plugin failed to
        // start its marker system, in which case structures are never announced and the exploration
        // path is simply off — everything else, including jobs granted by command, still works.
        if (markers != null) {
            manager.registerEvents(
                    new org.robtic.jobs.listeners.StructureScanListener(markers, discoveryService),
                    plugin);
        } else {
            plugin.getLogger().warning("RobticWorld's marker system is unavailable, so generated"
                    + " structures will not produce recruiters and no profession can be discovered"
                    + " by exploring.");
        }

        // The workspace controller is handed to the menu listener rather than being a listener of its
        // own, so every progression click still passes through one cancel-and-dispatch path.
        manager.registerEvents(new ProgressionMenuListener(plugin, titleService, jobService,
                sellService, titleMenu, jobMenu, workspaceController, messages), plugin);
    }

    private void registerCommands() {
        ProgressionCommands commands = new ProgressionCommands(
                jobService, titleService, jobMenu, titleMenu,
                workspaceService, repository, messages, this::reload);

        register("jobs", commands);
        register("titles", commands);

        // /workspace was declared in plugin.yml from the day this module was split out and never
        // bound. Bukkit answers an unbound declared command with its usage line, so it tab-completed
        // and did nothing — see WorkspaceCommand.
        register("workspace", new org.robtic.jobs.commands.WorkspaceCommand(
                jobService, workspaceService, workspaceController, messages));
    }

    /**
     * Binds a command, warning rather than throwing when it is missing from plugin.yml.
     *
     * A NullPointerException during enable takes the whole plugin down over one missing entry; a
     * warning leaves everything else working and names exactly what to add.
     */
    private <T extends org.bukkit.command.CommandExecutor & org.bukkit.command.TabCompleter>
            void register(String name, T commands) {

        var command = plugin.getServer().getPluginCommand(name);

        if (command == null) {
            plugin.getLogger().warning("The command \"" + name
                    + "\" is not declared in plugin.yml, so it will not work.");
            return;
        }

        command.setExecutor(commands);
        command.setTabCompleter(commands);
    }

    @Override
    public void disable() {
        // Saved synchronously: the scheduler stops accepting async tasks during disable, so anything
        // queued here would be silently dropped.
        // Before the repositories shut down: the sweep writes through them, and one firing
        // mid-shutdown would be a write nobody flushes.
        workerYieldService.stop();
        lifecycleService.stop();

        repository.shutdown();
        workspaceRepository.shutdown();

        discoveryService.clear();

        // Flushes whichever NPC backend is running. Citizens persists its own
        // NPCs, and a shutdown that skipped this would lose any created this session.
        npcService.shutdown();
    }
}
