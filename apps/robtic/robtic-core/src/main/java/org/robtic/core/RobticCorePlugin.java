package org.robtic.core;

import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.api.RequestQueue;
import org.robtic.core.config.CoreConfig;
import org.robtic.core.entitlement.EntitlementService;
import org.robtic.core.license.LicenseSystem;
import org.robtic.core.cache.BalanceCache;
import org.robtic.core.placeholder.CorePlaceholders;
import org.robtic.core.placeholder.RobticPlaceholders;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.PermissionSyncService;
import org.robtic.core.command.RobsCommands;
import org.robtic.core.command.RobticCommand;
import org.robtic.core.service.ConfigPushService;
import org.robtic.core.service.LeaderboardService;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.PriceService;
import org.robtic.core.service.RobsService;
import org.robtic.core.service.StatusService;
import org.robtic.core.service.RoleSyncService;
import org.robtic.core.service.RobticServices;
import org.robtic.core.notify.NotificationService;
import org.robtic.core.notify.NotificationSystem;
import org.robtic.core.statistics.StatisticsSystem;
import org.robtic.core.statistics.storage.FileStatisticsStorage;
import org.robtic.core.titles.FileTitleStore;
import org.robtic.core.titles.TitleCatalog;
import org.robtic.core.titles.TitleService;
import org.robtic.core.titles.TitleStore;
import org.robtic.core.unlock.Attributes;
import org.robtic.core.unlock.UnlockConditions;

import java.nio.file.Path;
import java.util.List;

/**
 * RobticCore: the shared infrastructure every other Robtic plugin is built on.
 *
 * <h2>Core depends on no Robtic plugin, ever</h2>
 *
 * That is the single rule the ecosystem's dependency graph rests on. If Core could depend on a
 * feature plugin, every cycle the refactor removed would be reachable again, and the load order
 * would stop being a straight line. Its only declared dependencies are external and optional.
 *
 * <h2>What is wired here</h2>
 *
 * Configuration, the API client and its offline queue, player data, permission and role
 * synchronisation, statistics, licences, titles and the PlaceholderAPI expansion. Each is published
 * through {@link RobticServices} so a feature plugin asks for an interface rather than reaching into
 * this class.
 *
 * <h2>Why services are registered rather than handed out</h2>
 *
 * RobticStaff needs {@link PermissionSyncService}; RobticJobs will need {@link TitleService}. Neither
 * may construct them, and neither should cast its way to this plugin through {@code getPlugin}.
 * Bukkit's service registry already solves the hard part — a service disappears automatically when
 * its owning plugin stops — so a consumer that resolves one at enable can trust it for the session.
 *
 * <h2>Degradation is per-feature, never fatal</h2>
 *
 * Statistics failing to start must not take licences down with it, and neither must stop the server.
 * Each subsystem is started inside its own guard: a failure names itself, disables one feature, and
 * leaves everything else running.
 */
public final class RobticCorePlugin extends RobticPlugin {

    private CoreConfig config;

    private RequestQueue queue;
    private ApiGateway gateway;

    private StatisticsSystem statistics;
    private LicenseSystem licenses;
    private NotificationSystem notifications;

    private TitleService titles;
    private TitleStore titleStore;

    private ConfigPushService configPush;
    private RoleSyncService roleSync;
    private RobticPlaceholders placeholders;
    private BalanceCache balances;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.optional("LuckPerms",
                        "permission and group synchronisation is unavailable"),
                PluginDependency.optional("PlaceholderAPI",
                        "Robtic placeholders will not be registered"),
                PluginDependency.optional("Citizens",
                        "licences cannot be renewed at an NPC, though every other part of the"
                                + " licence system still works"));
    }

    @Override
    protected void start() {
        config = new CoreConfig(this);
        config.reload();

        startApi();
        startPlaceholders();
        startPlayerData();
        // Before the feature systems, so anything started after it can warn players about its own
        // state. It depends on nothing but configuration, so there is no ordering risk in going early.
        startNotifications();
        startStatistics();
        startTitles();
        startLicences();

        contributePlaceholders();

        // Nothing registers a real one unless RobticPremium is installed. Registered here so every
        // consumer resolves the same way whether or not it is — see EntitlementService.NONE.
        RobticServices.register(this, EntitlementService.class, EntitlementService.NONE);

        // One request per join and per quit, published as an event every other plugin reads — see
        // PlayerConnectionListener for why this is not five listeners in five plugins.
        getServer().getPluginManager().registerEvents(new org.robtic.core.listener.PlayerConnectionListener(
                this, gateway.client(), gateway, config.api(),
                RobticServices.find(PlayerDataService.class).orElseThrow(),
                roleSync), this);

        registerCommands();
        startTasks();

        getLogger().info("RobticCore ready.");
    }

    /**
     * The three background tasks Core owns.
     *
     * <h2>Why these are here and not in the plugins that benefit</h2>
     *
     * All three act on infrastructure Core holds: the offline queue, the API client, and the caches
     * the placeholders read. A feature plugin scheduling its own refresh of Core's cache would mean
     * two timers writing to one map at intervals neither knows about.
     */
    private void startTasks() {
        long heartbeat = config.api().heartbeatTicks();
        long retry = config.api().retryIntervalTicks();
        long refresh = config.api().placeholderRefreshTicks();

        StatusService status = RobticServices.find(StatusService.class).orElseThrow();

        // Keeps the caches the placeholders read warm.
        //
        // Nothing else refreshes a profile or a balance on a schedule — they are fetched when a
        // player joins or runs a command, which is enough for a command and not enough for a tab
        // list re-rendering every second off whatever is in memory. This is the task that makes
        // "cached" mean "recent" rather than "whenever they last typed /bal".
        getServer().getScheduler().runTaskTimerAsynchronously(this, this::warmCaches, refresh, refresh);

        getServer().getScheduler().runTaskTimerAsynchronously(this, () -> {
            try {
                status.reportHeartbeat();
            } catch (RuntimeException error) {
                getLogger().fine("Heartbeat failed: " + error.getMessage());
            }
        }, heartbeat, heartbeat);

        // Replays anything queued during an outage. Cheap when the queue is empty, which is the
        // normal case, so it can run often enough to recover quickly.
        getServer().getScheduler().runTaskTimer(this, gateway::flushQueue, retry, retry);
    }

    /**
     * Refreshes the caches the placeholders read, plus the leaderboard. Runs on a worker.
     *
     * Balances are fetched for everyone in <em>one</em> request rather than one per player, which is
     * the single biggest reduction in this plugin's traffic — a 60-player server goes from sixty
     * requests a pass to one. Profiles still refresh individually, but the service serves from cache
     * while fresh, so the real request count is governed by the profile TTL rather than by how often
     * this runs.
     */
    private void warmCaches() {
        PlayerDataService players = RobticServices.find(PlayerDataService.class).orElseThrow();
        RobsService robs = RobticServices.find(RobsService.class).orElseThrow();
        LeaderboardService leaderboard = RobticServices.find(LeaderboardService.class).orElseThrow();

        java.util.List<java.util.UUID> online = new java.util.ArrayList<>();

        for (var player : getServer().getOnlinePlayers()) {
            online.add(player.getUniqueId());

            try {
                players.profile(player.getUniqueId(), player.getName());
            } catch (org.robtic.core.api.ApiException error) {
                getLogger().fine("Profile warm-up failed for " + player.getName()
                        + ": " + error.getMessage());
            }
        }

        // Each guarded separately rather than as one block, so an outage affecting one endpoint does
        // not skip the other two — and so nothing here can escape into the scheduler.
        //
        // An exception leaving a repeating task is worse than it looks: Bukkit prints a full stack
        // trace naming this plugin every time it fires, which during an API outage means one every
        // thirty seconds for as long as the outage lasts. FINE is right — the gateway already
        // reports the outage itself, once, and everything here is a cache warm whose failure costs
        // staleness rather than correctness.
        guard("balances", () -> robs.refreshBalances(online));

        // Sends only the players whose groups actually moved, as one request. Usually there are
        // none, in which case this makes no request at all.
        guard("role sync", roleSync::flush);

        guard("leaderboard", leaderboard::refresh);
    }

    /** Runs a cache refresh, reporting a failure quietly instead of letting it reach the scheduler. */
    private void guard(String what, Runnable work) {
        try {
            work.run();
        } catch (RuntimeException failure) {
            getLogger().fine("Cache warm-up for " + what + " failed: " + failure.getMessage());
        }
    }

    /**
     * Adds Core's own placeholders to its expansion.
     *
     * Statistics and licences both publish under the shared {@code robtic_} identifier rather than
     * expansions of their own — PlaceholderAPI allows one per identifier, and a second would mean
     * {@code %robticstats_…%} sitting next to {@code %robtic_robs%} in every config on the server.
     *
     * Statistics is registered before licences and after nothing, matching the monolith's order: a
     * {@code %robtic_stat_…%} key must not be shadowed by a prefix another extension claims, and the
     * first non-null answer wins.
     */
    private void contributePlaceholders() {
        placeholders.extend(new CorePlaceholders(
                RobticServices.find(PlayerDataService.class).orElseThrow(),
                balances,
                RobticServices.find(LeaderboardService.class).orElseThrow(),
                RobticServices.find(PermissionSyncService.class).orElseThrow(),
                config.roles()));

        if (statistics != null) {
            placeholders.extend(new org.robtic.core.statistics.StatisticsPlaceholders(
                    statistics.service()));
        }

        if (licenses != null) {
            placeholders.extend(licenses.placeholders());
        }
    }

    /**
     * The two commands Core owns.
     *
     * {@code /robs} is the economy, which is Core's. {@code /robtic} is the administrative command
     * for the plugin ecosystem itself — status, prices, reload, queue — and belongs with the
     * configuration and the API client it acts on.
     *
     * In the monolith both lived on one executor alongside {@code /link} and {@code /exchange}. Those
     * two now belong to RobticDiscord and RobticMarket, so the class was split three ways and each
     * plugin registers its own. Names, aliases and permissions are unchanged.
     */
    private void registerCommands() {
        RobsCommands robs = new RobsCommands(this, config.messages(), gateway,
                RobticServices.find(PlayerDataService.class).orElseThrow(),
                RobticServices.find(RobsService.class).orElseThrow(),
                RobticServices.find(LeaderboardService.class).orElseThrow());

        for (String name : List.of("robs", "bal", "balance")) {
            bind(name, robs);
        }

        bind("robtic", new RobticCommand(this, config, gateway,
                RobticServices.find(PriceService.class).orElseThrow(),
                RobticServices.find(StatusService.class).orElseThrow()));
    }

    private void bind(String name, org.bukkit.command.CommandExecutor executor) {
        var command = getServer().getPluginCommand(name);

        if (command == null) {
            // Only warned about for the primary name. `bal` and `balance` are aliases of `robs` and
            // are resolved through it, so their absence here is expected and not a problem.
            if (name.equals("robs") || name.equals("robtic")) {
                getLogger().warning("The command \"" + name + "\" is not declared in plugin.yml,"
                        + " so it will not work.");
            }
            return;
        }

        command.setExecutor(executor);
    }

    /**
     * Sends this server's configuration to the API.
     *
     * Core fills in the guild, the bridge channels and the price table. Everything else — the premium
     * ladder, the moderation log routes — is contributed by the plugin that owns it, because Core owns
     * neither premium.yml nor staff.yml and must not parse them. See DiscordDocument.
     */
    public void pushConfiguration() {
        getServer().getScheduler().runTaskAsynchronously(this, () -> configPush.push(
                config.raw("config.yml"),
                config.raw("roles.yml"),
                config.raw("prices.yml"),
                RobticServices.findAll(org.robtic.core.discord.DiscordDocument.class)));
    }

    /**
     * The API client, its offline queue and the gateway that owns reconnection.
     *
     * Settings go in as a supplier rather than a value: a reload replaces the settings object, and a
     * client holding the old one would keep using the old API key indefinitely.
     */
    private void startApi() {
        queue = new RequestQueue(Path.of(getDataFolder().getPath(), "queue.jsonl"), getLogger());
        queue.load();

        ApiClient client = new ApiClient(config::api, getLogger(), getPluginMeta().getVersion());

        gateway = new ApiGateway(this, client, queue);

        RobticServices.register(this, ApiGateway.class, gateway);
    }

    private void startPlaceholders() {
        placeholders = new RobticPlaceholders(this);

        if (placeholders.install()) {
            getLogger().info("Registered the \"robtic\" placeholder expansion.");
        }

        // Registered whether or not PlaceholderAPI is present, so a feature plugin contributing
        // placeholders never has to branch on it — its extension is simply never consulted.
        RobticServices.register(this, RobticPlaceholders.class, placeholders);
    }

    private void startPlayerData() {
        ApiClient client = new ApiClient(config::api, getLogger(), getPluginMeta().getVersion());

        PlayerDataService players = new PlayerDataService(client, config.api(), getLogger());

        PermissionSyncService permissions =
                new PermissionSyncService(this, config.server().permissionSyncEnabled());

        // Mirrors LuckPerms groups onto Discord roles. Minecraft is the authority; nothing writes
        // groups back from Discord.
        roleSync = new RoleSyncService(this, gateway, config.api(), config.roles(), permissions);
        roleSync.start();

        ApiClient client2 = new ApiClient(config::api, getLogger(), getPluginMeta().getVersion());

        configPush = new ConfigPushService(client2, config.api(), getLogger());

        // One cache, held as a field: the economy writes to it and the placeholders read from it, and
        // two instances would show a player a balance the payment never reached.
        balances = new BalanceCache(
                java.nio.file.Path.of(getDataFolder().getPath(), "balances.json"),
                getLogger(), config.api().offlineMaxAgeMillis());
        balances.load();

        RobticServices.register(this, BalanceCache.class, balances);
        RobticServices.register(this, RobsService.class,
                new RobsService(client2, gateway, config.api(), balances));
        RobticServices.register(this, PriceService.class,
                new PriceService(client2, config.api(), getLogger(), 60_000L));
        RobticServices.register(this, LeaderboardService.class,
                new LeaderboardService(client2, config.api(), getLogger()));
        RobticServices.register(this, StatusService.class,
                new StatusService(client2, gateway, config.api(), config.server(), getLogger()));

        // Runs on the reconnect edge: drains the queue, then reconciles every pending credit against
        // the API before anything reads a balance back. Without it, an outage leaves locally credited
        // robs that never get confirmed — the player sees them, the API does not.
        RobsService robsService = RobticServices.find(RobsService.class).orElseThrow();
        PriceService priceService = RobticServices.find(PriceService.class).orElseThrow();

        org.robtic.core.service.ResyncService resync = new org.robtic.core.service.ResyncService(
                this, gateway, robsService, players, priceService, balances, config.messages());

        gateway.onReconnect(resync::run);

        RobticServices.register(this, PlayerDataService.class, players);
        RobticServices.register(this, PermissionSyncService.class, permissions);
        RobticServices.register(this, RoleSyncService.class, roleSync);
    }

    private void startNotifications() {
        try {
            notifications = new NotificationSystem(this, () -> config.raw("notifications.yml"));
            notifications.enable();

            RobticServices.register(this, NotificationService.class, notifications.service());

            // The module itself, alongside the interface — the same pair LicenseSystem is published
            // as. A consumer that only sends notifications takes the interface; one that legitimately
            // needs more (clearing the repeat-suppression memory when a licence is renewed, say)
            // takes this.
            RobticServices.register(this, NotificationSystem.class, notifications);
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(java.util.logging.Level.SEVERE, "The notification system failed to start."
                    + " Players will not be warned about anything; every other system is unaffected,"
                    + " because a send with nothing registered is a no-op rather than an error.",
                    failure);

            notifications = null;

            // Registered anyway, so a consumer that resolves the service still gets the silent
            // implementation rather than falling back per call site. Without this the seam would be
            // absent, and a caller using find() rather than findOr() would have to handle a case
            // that only exists after a failure nobody can see from the call site.
            RobticServices.register(this, NotificationService.class, NotificationService.NONE);
        }
    }

    private void startStatistics() {
        try {
            statistics = new StatisticsSystem(this,
                    new FileStatisticsStorage(getDataFolder().toPath().resolve("statistics")),
                    () -> config.raw("statistics.yml"));

            statistics.enable();

            RobticServices.register(this, org.robtic.core.statistics.StatisticsService.class,
                    statistics.service());
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(java.util.logging.Level.SEVERE, "The statistics system failed to start."
                    + " Nothing will be recorded; every other system is unaffected and stored values"
                    + " are untouched.", failure);

            statistics = null;
        }
    }

    /**
     * Titles, on their own storage.
     *
     * The legacy directory is the 3.x monolith's player folder. {@link FileTitleStore} reads it only
     * when it has no file of its own for a player, lifts the titles out and never modifies it — see
     * that class for why the original is left alone.
     */
    private void startTitles() {
        try {
            Path legacy = getDataFolder().toPath().getParent()
                    .resolve("RobticMinecraft").resolve("progression").resolve("players");

            titleStore = new FileTitleStore(this,
                    getDataFolder().toPath().resolve("titles"), legacy);

            UnlockConditions conditions = new UnlockConditions(getLogger());
            Attributes attributes = new Attributes(getLogger());

            TitleCatalog catalog = new TitleCatalog(getLogger(), conditions);
            catalog.load(config.raw("titles.yml"));

            titles = new TitleService(this, catalog, titleStore, attributes);

            // How a worn title is shown. LuckPerms when it is present, nothing otherwise — a title
            // is still owned and still equipped without it, it simply does not appear in chat.
            titles.displayWith(org.robtic.core.titles.hooks.LuckPermsTitleDisplay.createOrNone(
                    this, config.raw("titles.yml").getBoolean("display.as-suffix", false)));

            RobticServices.register(this, TitleService.class, titles);
            RobticServices.register(this, TitleStore.class, titleStore);
            RobticServices.register(this, Attributes.class, attributes);
            RobticServices.register(this, UnlockConditions.class, conditions);

            // The catalogue itself, and not only the service wrapping it. RobticJobs contributes its
            // milestone titles directly into this instance — that is what stops it building a second
            // catalogue that would disagree with Core's about what exists — so it needs the object,
            // not just something that reads it.
            //
            // Its absence here was silent in Core and fatal in Jobs: every collaborator around it was
            // registered, Core logged "Titles ready" and carried on, and RobticJobs then refused to
            // start at all because a required service it had no other way to reach was missing.
            RobticServices.register(this, TitleCatalog.class, catalog);

            getLogger().info("Titles ready: " + catalog.titles().size() + " defined.");
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(java.util.logging.Level.SEVERE,
                    "The title system failed to start. No title data was touched.", failure);

            titles = null;
        }
    }

    private void startLicences() {
        try {
            licenses = new LicenseSystem(this, config.messages(), () -> config.raw("licenses.yml"));

            if (statistics != null) {
                licenses.statistics(statistics.service());
            }

            licenses.enable();

            RobticServices.register(this, LicenseSystem.class, licenses);
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(java.util.logging.Level.SEVERE, "The licence system failed to start."
                    + " Licences are unavailable; everything else is unaffected and no player item"
                    + " was touched.", failure);

            licenses = null;
        }
    }

    @Override
    protected void stop() {
        // Reverse of construction: anything that records a final value stops before the thing it
        // records into.
        if (licenses != null) {
            licenses.disable();
        }

        if (statistics != null) {
            statistics.disable();
        }

        // After both, so a system that notifies something on its way down still has channels.
        if (notifications != null) {
            notifications.disable();
        }

        // Flushed rather than stopped: RoleSyncService has no stop, because its work is a scheduled
        // task that Bukkit cancels for us. What it does have is pending role changes that would be
        // lost, so they are pushed now while the API client is still usable.
        if (roleSync != null) {
            roleSync.flush();
        }

        // Saved synchronously: the scheduler stops accepting async tasks during disable, so anything
        // queued now would be silently dropped.
        if (queue != null) {
            queue.save();
        }
    }

    /** Re-reads every file Core owns and rebuilds its settings. */
    public void reloadAll() {
        config.reload();

        if (statistics != null) {
            statistics.reload();
        }

        if (licenses != null) {
            licenses.reload();
        }

        if (notifications != null) {
            notifications.reload();
        }
    }

    // ─── Accessors, for modules inside this plugin ────────────────────────────────────────────
    //
    // Other plugins go through RobticServices instead. These exist for Core's own wiring and for a
    // module that legitimately lives inside Core.

    public CoreConfig config() {
        return config;
    }

    /**
     * The notification module, or null when it failed to start.
     *
     * Other plugins take {@link NotificationService} from {@code RobticServices} instead. This
     * exists for the one caller that needs more than the interface — see
     * {@code NotificationSystem#dispatcher}.
     */
    public NotificationSystem notifications() {
        return notifications;
    }

    public ApiGateway gateway() {
        return gateway;
    }

    public RobticPlaceholders placeholders() {
        return placeholders;
    }

    public TitleService titles() {
        return titles;
    }
}
