package org.robtic.minecraft.progression;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.progression.api.Attributes;
import org.robtic.minecraft.progression.api.ProgressionModule;
import org.robtic.minecraft.progression.api.UnlockConditions;
import org.robtic.minecraft.progression.commands.ProgressionCommands;
import org.robtic.minecraft.progression.gui.JobMenu;
import org.robtic.minecraft.progression.gui.ProgressionMenuListener;
import org.robtic.minecraft.progression.gui.TitleMenu;
import org.robtic.minecraft.progression.hooks.LuckPermsTitleDisplay;
import org.robtic.minecraft.progression.hooks.ProgressionPlaceholders;
import org.robtic.minecraft.progression.hooks.ProgressionStatistics;
import org.robtic.minecraft.progression.jobs.JobCatalog;
import org.robtic.minecraft.progression.jobs.JobLimits;
import org.robtic.minecraft.progression.jobs.JobService;
import org.robtic.minecraft.progression.listeners.JobActionListener;
import org.robtic.minecraft.progression.listeners.NpcInteractionListener;
import org.robtic.minecraft.progression.listeners.ProgressionPlayerListener;
import org.robtic.minecraft.progression.market.JobEconomy;
import org.robtic.minecraft.progression.market.SellConditions;
import org.robtic.minecraft.progression.market.SellQuotas;
import org.robtic.minecraft.progression.market.SellService;
import org.robtic.minecraft.progression.npc.NpcService;
import org.robtic.minecraft.progression.storage.ProgressionRepository;
import org.robtic.minecraft.progression.storage.ProgressionStorage;
import org.robtic.minecraft.progression.titles.TitleCatalog;
import org.robtic.minecraft.progression.titles.TitleService;
import org.robtic.minecraft.progression.npc.NpcBackend;
import org.robtic.minecraft.progression.workspace.DiscoveryService;
import org.robtic.minecraft.progression.workspace.WorkspaceController;
import org.robtic.minecraft.progression.workspace.WorkspaceMenu;
import org.robtic.minecraft.progression.workspace.WorkspaceNpcRole;
import org.robtic.minecraft.progression.workspace.WorkspaceRepository;
import org.robtic.minecraft.progression.workspace.WorkspaceService;
import org.robtic.minecraft.progression.workspace.WorkspaceSettings;
import org.robtic.minecraft.progression.workspace.WorkspaceTaxService;

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
 *   NpcService ← NpcBackend                       (FancyNPCs, Citizens or the builtin)
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
public final class ProgressionSystem implements ProgressionModule {

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

    private final SellQuotas sellQuotas;
    private final SellService sellService;

    private final TitleMenu titleMenu;
    private final JobMenu jobMenu;

    /** Reads the current config files. A supplier so a reload re-reads rather than reusing a copy. */
    private final Supplier<FileConfiguration> titlesConfig;
    private final Supplier<FileConfiguration> jobsConfig;
    private final Supplier<FileConfiguration> npcConfig;
    private final Supplier<FileConfiguration> workspaceConfig;

    private final ToIntFunction<UUID> premiumTier;
    private final Predicate<UUID> tester;

    /**
     * Where this system's facts are recorded. Null when no statistics system is running.
     *
     * Not a constructor parameter, because statistics are optional infrastructure and a module that
     * cannot start without them is not optional infrastructure. See {@link #statistics}.
     */
    private org.robtic.minecraft.statistics.StatisticsService statistics;

    public ProgressionSystem(
            Plugin plugin,
            MessageCatalog messages,
            ProgressionStorage storage,
            Supplier<FileConfiguration> titlesConfig,
            Supplier<FileConfiguration> jobsConfig,
            Supplier<FileConfiguration> npcConfig,
            Supplier<FileConfiguration> workspaceConfig,
            ToIntFunction<UUID> premiumTier,
            Predicate<UUID> tester
    ) {
        this.plugin = plugin;
        this.messages = messages;
        this.titlesConfig = titlesConfig;
        this.jobsConfig = jobsConfig;
        this.npcConfig = npcConfig;
        this.workspaceConfig = workspaceConfig;
        this.premiumTier = premiumTier;
        this.tester = tester;

        this.attributes = new Attributes(plugin.getLogger());
        this.conditions = new UnlockConditions(plugin.getLogger());
        this.repository = new ProgressionRepository(plugin, storage);

        this.titleCatalog = new TitleCatalog(plugin.getLogger(), conditions);
        this.titleService = new TitleService(plugin, titleCatalog, repository, attributes);

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
                        workspaceConfig.get().getConfigurationSection("workspace"), plugin.getLogger()),
                premiumTier);

        this.taxService = new WorkspaceTaxService(plugin, workspaceService, messages);
        this.discoveryService = new DiscoveryService(plugin, jobCatalog, npcService, workspaceService);

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
    public void statistics(org.robtic.minecraft.statistics.StatisticsService statistics) {
        this.statistics = statistics;
    }

    /** The placeholder extension, for registering with the plugin's existing expansion. */
    public ProgressionPlaceholders placeholders() {
        return new ProgressionPlaceholders(jobService, titleService);
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    @Override
    public void enable() {
        // The job service publishes job.* attributes, which the unlock conditions read. Registered
        // before configs load so a title parsed at load can already resolve its condition path.
        attributes.register(jobService);

        loadConfiguration();

        titleService.displayWith(LuckPermsTitleDisplay.createOrNone(plugin,
                titlesConfig.get().getBoolean("display.as-suffix", false)));

        // The seller and upgrade NPCs both open the workspace panel. Registered as role handlers
        // rather than special-cased in the interaction listener, so a future contract or event NPC
        // plugs in exactly the same way — see WorkspaceNpcRole.Handler.
        workspaceService.handler(WorkspaceNpcRole.SELLER, workspaceController::openFromNpc);
        workspaceService.handler(WorkspaceNpcRole.UPGRADE, workspaceController::openFromNpc);

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
        workspaceRepository.load(workspaceService::repairAll);

        // One object serving as both a workspace extension and a Bukkit listener, because it is one
        // responsibility: everything this system does that is worth counting, counted in the one
        // place the server treats as authoritative. See ProgressionStatistics.
        if (statistics != null) {
            ProgressionStatistics recorder = new ProgressionStatistics(statistics);

            workspaceService.register(recorder);
            plugin.getServer().getPluginManager().registerEvents(recorder, plugin);
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
     * Order matters: titles first, because {@link JobCatalog} contributes milestone titles into the
     * catalog and loading titles clears it. Reversing them would wipe out every job title on each
     * reload — the bug would look like job titles vanishing until a restart.
     */
    private void loadConfiguration() {
        FileConfiguration titlesFile = titlesConfig.get();
        FileConfiguration jobsFile = jobsConfig.get();

        titleCatalog.load(titlesFile);
        jobCatalog.load(jobsFile);
        npcService.load(npcConfig.get());

        jobService.limits(JobLimits.parse(
                jobsFile.getConfigurationSection("limits"), premiumTier, tester, plugin.getLogger()));

        sellService.conditions(sellConditions(jobsFile));

        sellQuotas.zone(zone(jobsFile.getString("quota-timezone", "UTC")));

        discoveryService.configure(
                jobsFile.getBoolean("discovery.enabled", true),
                Set.copyOf(jobsFile.getStringList("discovery.worlds")));

        // Rebuilt wholesale and handed to the service, so a reload cannot leave it reading a mix of
        // old and new tiers. Existing workspaces keep their level; only what a level *means* changes.
        workspaceService.settings(new WorkspaceSettings(
                workspaceConfig.get().getConfigurationSection("workspace"), plugin.getLogger()));
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

            parsed.put(org.robtic.minecraft.util.Ids.normalise(jobId),
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

        // Not a Bukkit listener: it registers with the NPC backend, because FancyNPCs NPCs are
        // packets and never raise an interact event. See NpcInteractionListener.
        new NpcInteractionListener(
                plugin, npcService, jobService, workspaceService, discoveryService, messages).register();

        manager.registerEvents(new JobActionListener(plugin, jobService), plugin);
        manager.registerEvents(
                new org.robtic.minecraft.progression.workspace.WorkspaceProtectionListener(
                        workspaceService, messages), plugin);
        manager.registerEvents(new ProgressionPlayerListener(
                plugin, repository, titleService, workspaceService, discoveryService, sellQuotas), plugin);

        // The workspace controller is handed to the menu listener rather than being a listener of its
        // own, so every progression click still passes through one cancel-and-dispatch path.
        manager.registerEvents(new ProgressionMenuListener(plugin, titleService, jobService,
                sellService, titleMenu, jobMenu, workspaceController, messages), plugin);
    }

    private void registerCommands() {
        ProgressionCommands commands = new ProgressionCommands(
                jobService, titleService, jobMenu, titleMenu, messages, this::reload);

        register("jobs", commands);
        register("titles", commands);
    }

    /**
     * Binds a command, warning rather than throwing when it is missing from plugin.yml.
     *
     * A NullPointerException during enable takes the whole plugin down over one missing entry; a
     * warning leaves everything else working and names exactly what to add.
     */
    private void register(String name, ProgressionCommands commands) {
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
        repository.shutdown();
        workspaceRepository.shutdown();

        discoveryService.clear();

        // Flushes whichever NPC backend is running. Citizens and FancyNPCs both persist their own
        // NPCs, and a shutdown that skipped this would lose any created this session.
        npcService.shutdown();
    }
}
