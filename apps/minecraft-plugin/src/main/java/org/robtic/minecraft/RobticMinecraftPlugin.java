package org.robtic.minecraft;

import org.bukkit.command.CommandExecutor;
import org.bukkit.command.PluginCommand;
import org.bukkit.command.TabCompleter;
import org.bukkit.plugin.PluginManager;
import org.bukkit.plugin.java.JavaPlugin;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.api.RequestQueue;
import org.robtic.minecraft.afk.AfkActivityListener;
import org.robtic.minecraft.afk.AfkCommands;
import org.robtic.minecraft.afk.AfkOverlay;
import org.robtic.minecraft.afk.AfkRewardService;
import org.robtic.minecraft.afk.AfkService;
import org.robtic.minecraft.afk.AfkSettings;
import org.robtic.minecraft.auth.AuthAdminCommands;
import org.robtic.minecraft.auth.AuthChatListener;
import org.robtic.minecraft.auth.AuthConfigurationListener;
import org.robtic.minecraft.auth.AuthChatPrompt;
import org.robtic.minecraft.auth.AuthDialogPrompt;
import org.robtic.minecraft.auth.AuthPlacementListener;
import org.robtic.minecraft.auth.AuthPlatform;
import org.robtic.minecraft.auth.AuthPromptRouter;
import org.robtic.minecraft.auth.AuthRestrictionListener;
import org.robtic.minecraft.auth.AuthService;
import org.robtic.minecraft.auth.AuthSettings;
import org.robtic.minecraft.cache.BalanceCache;
import org.robtic.minecraft.command.PlayerCommands;
import org.robtic.minecraft.command.RobticCommand;
import org.robtic.minecraft.command.StaffCommands;
import org.robtic.minecraft.config.ConfigRegistry;
import org.robtic.minecraft.gui.ExchangeController;
import org.robtic.minecraft.gui.ExchangeMenu;
import org.robtic.minecraft.gui.StaffMenuFactory;
import org.robtic.minecraft.listener.ExchangeMenuListener;
import org.robtic.minecraft.listener.NpcHooks;
import org.robtic.minecraft.listener.NpcInteractListener;
import org.robtic.minecraft.listener.PlayerChatListener;
import org.robtic.minecraft.listener.PlayerConnectionListener;
import org.robtic.minecraft.listener.RestrictionListener;
import org.robtic.minecraft.listener.StaffMenuListener;
import org.robtic.minecraft.listener.StaffToolListener;
import org.robtic.minecraft.mail.MailCommand;
import org.robtic.minecraft.mail.MailMenu;
import org.robtic.minecraft.mail.MailMenuListener;
import org.robtic.minecraft.mail.MailService;
import org.robtic.minecraft.service.BridgeConsumerService;
import org.robtic.minecraft.service.ChatBridgeService;
import org.robtic.minecraft.service.ConfigPushService;
import org.robtic.minecraft.placeholder.RobticPlaceholders;
import org.robtic.minecraft.service.RobsService;
import org.robtic.minecraft.service.LeaderboardService;
import org.robtic.minecraft.service.PermissionSyncService;
import org.robtic.minecraft.service.RoleSyncService;
import org.robtic.minecraft.survival.SurvivalApi;
import org.robtic.minecraft.survival.SurvivalCacheService;
import org.robtic.minecraft.lobby.LobbyConfiguration;
import org.robtic.minecraft.lobby.LobbyItems;
import org.robtic.minecraft.lobby.LobbyListener;
import org.robtic.minecraft.lobby.LobbyManager;
import org.robtic.minecraft.lobby.LobbyMenuListener;
import org.robtic.minecraft.lobby.LobbyNotifications;
import org.robtic.minecraft.lobby.LobbyPlayerInteraction;
import org.robtic.minecraft.lobby.LobbyRestrictions;
import org.robtic.minecraft.lobby.PlayerVisibilityService;
import org.robtic.minecraft.lobby.command.LobbyCommands;
import org.robtic.minecraft.lobby.gui.LobbyMenus;
import org.robtic.minecraft.survival.PremiumSyncService;
import org.robtic.minecraft.survival.TeleportService;
import org.robtic.minecraft.survival.command.BackCommand;
import org.robtic.minecraft.survival.command.ChestCommands;
import org.robtic.minecraft.survival.command.HomeCommands;
import org.robtic.minecraft.survival.command.ProfileCommand;
import org.robtic.minecraft.survival.command.SpawnCommands;
import org.robtic.minecraft.survival.cosmetic.CosmeticCommands;
import org.robtic.minecraft.survival.cosmetic.ParticleService;
import org.robtic.minecraft.survival.friend.FriendCommands;
import org.robtic.minecraft.survival.friend.FriendTeleportService;
import org.robtic.minecraft.survival.gui.FriendsMenu;
import org.robtic.minecraft.survival.gui.HomesMenu;
import org.robtic.minecraft.survival.gui.ParticleMenu;
import org.robtic.minecraft.survival.gui.ProfileMenu;
import org.robtic.minecraft.survival.listener.SurvivalListener;
import org.robtic.minecraft.survival.listener.SurvivalMenuListener;
import org.robtic.minecraft.service.PlayerDataService;
import org.robtic.minecraft.service.PriceService;
import org.robtic.minecraft.service.ResyncService;
import org.robtic.minecraft.service.StaffLogService;
import org.robtic.minecraft.service.StatusService;
import org.robtic.minecraft.staff.FlightCommand;
import org.robtic.minecraft.staff.FreezeService;
import org.robtic.minecraft.staff.JailService;
import org.robtic.minecraft.staff.StaffActionDispatcher;
import org.robtic.minecraft.staff.StaffChatService;
import org.robtic.minecraft.staff.StaffModeService;
import org.robtic.minecraft.staff.ReportChatListener;
import org.robtic.minecraft.staff.ReportChatService;
import org.robtic.minecraft.staff.ReportService;
import org.robtic.minecraft.staff.LastSeenLocations;
import org.robtic.minecraft.staff.StaffAvailabilityService;
import org.robtic.minecraft.staff.StaffRosterCommands;
import org.robtic.minecraft.staff.StaffStatsCache;
import org.robtic.minecraft.staff.StaffToolService;
import org.robtic.minecraft.staff.VanishService;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Entry point and composition root.
 *
 * Every collaborator is constructed here and injected, so no class reaches for a global — which is
 * also what makes the services usable without a live server in a test.
 *
 * <h2>Startup</h2>
 *
 * The plugin does <b>not</b> block the server on the API being reachable. It enables, registers
 * everything, and connects in the background; features that genuinely require the API refuse
 * individually and say so. A game server should not fail to start because an HTTP service is
 * restarting.
 */
public final class RobticMinecraftPlugin extends JavaPlugin {

    private ConfigRegistry config;
    private ApiGateway gateway;
    private RequestQueue queue;
    private BalanceCache balances;
    private StatusService status;
    private StaffModeService staffMode;
    private FreezeService freeze;
    private ConfigPushService configPush;
    private AfkService afk;
    private AfkRewardService afkRewards;
    private AfkOverlay afkOverlay;
    private AuthService auth;
    private PlayerVisibilityService visibility;
    private RoleSyncService roleSync;
    private SurvivalCacheService survivalCache;
    private ParticleService particles;
    private PremiumSyncService premiumSync;

    /**
     * Jobs and titles.
     *
     * Built as one module with its own lifecycle rather than a dozen fields here, because the whole
     * point of its design is that it can be lifted into a separate plugin later — and it cannot be
     * if its wiring is spread across this class. See {@link org.robtic.minecraft.progression.ProgressionSystem}.
     */
    private org.robtic.minecraft.progression.ProgressionSystem progression;

    /**
     * The one source of truth for every tracked number on the server.
     *
     * Core infrastructure rather than a feature, and started before everything that records into it.
     * Nothing in this module depends on jobs, the economy or workspaces; the arrows all point at it,
     * which is what keeps it possible for every future system to record through it without any of
     * them being able to entangle it.
     */
    private org.robtic.minecraft.statistics.StatisticsSystem statistics;

    /**
     * Licences: official documents permitting an activity.
     *
     * Core progression infrastructure, and deliberately independent of jobs, workspaces and the
     * marketplace — all of which will gate on it rather than being known to it. Ownership is the
     * item in a player's inventory, signed so it cannot be forged; there is no database row.
     */
    private org.robtic.minecraft.license.LicenseSystem licenses;

    /**
     * The building marker system. Null when it failed to start.
     *
     * Deliberately not handed to any other system. Anything that wants to know about a structure
     * listens for {@code StructureScannedEvent}; anything that wants to add a marker type reaches
     * this through {@link #markers()}. Passing it around as a dependency would recreate exactly the
     * coupling the registry exists to avoid.
     */
    private org.robtic.minecraft.structure.StructureMarkerSystem markers;

    // Built by registerSurvival and reused by the lobby: the lobby's friend buttons and profile
    // view are the same services, not second copies of them.
    private FriendTeleportService friendTeleports;
    private ProfileMenu profileMenu;
    private LobbyManager lobbyManager;
    private StaffAvailabilityService staffAvailability;
    private StaffStatsCache staffStats;
    private ReportService reportService;
    private MailService mail;
    private MailMenu mailMenu;
    private LastSeenLocations lastSeen;

    @Override
    public void onEnable() {
        config = new ConfigRegistry(this);
        config.reload();

        if (!config.api().isConfigured()) {
            getLogger().severe("api.yml is not configured — set api.url, api.api-key and api.guild-id. Disabling.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        String version = getPluginMeta().getVersion();

        queue = new RequestQueue(Path.of(getDataFolder().getPath(), "queue.jsonl"), getLogger());
        queue.load();

        // Passed as a supplier, not a value: `/robtic reload` replaces the settings object, and a
        // client holding the old one would keep using the old API key. See ApiClient#settings.
        ApiClient client = new ApiClient(config::api, getLogger(), version);
        gateway = new ApiGateway(this, client, queue);

        // --- Core services -------------------------------------------------------------------
        balances = new BalanceCache(
                Path.of(getDataFolder().getPath(), "balances.json"), getLogger(), config.api().offlineMaxAgeMillis());
        balances.load();

        configPush = new ConfigPushService(client, config.api(), getLogger());

        PlayerDataService players = new PlayerDataService(client, config.api(), getLogger());
        PriceService prices = new PriceService(client, config.api(), getLogger(), 60_000L);
        RobsService robs = new RobsService(client, gateway, config.api(), balances);

        // Runs on the reconnect edge: drains the queue, then reconciles every pending credit
        // against the API before anything reads a balance back.
        ResyncService resync = new ResyncService(
                this, gateway, robs, players, prices, balances, config.messages());
        gateway.onReconnect(resync::run);
        PermissionSyncService permissions = new PermissionSyncService(this, config.server().permissionSyncEnabled());

        // Mirrors LuckPerms groups onto Discord roles. Minecraft is the authority; nothing writes
        // groups back from Discord any more.
        roleSync = new RoleSyncService(this, gateway, config.api(), config.roles(), permissions);
        roleSync.start();

        // --- Survival feature set ---------------------------------------------------------------
        //
        // Built as one stack because every feature reads through the same cache: the API access
        // layer, the cache in front of it, and the teleport service the movement commands share.
        SurvivalApi survivalApi = new SurvivalApi(client, config.api());
        survivalCache = new SurvivalCacheService(survivalApi, config.server().freeHomeLimit());

        // `robtic.tester` lifts every premium limit this server enforces, so staff can exercise a
        // paid feature without buying it. The permission side is handled by plugin.yml, which grants
        // the node's children; premium is not a permission, so it is short-circuited here.
        survivalCache.testerWhen(uuid -> {
            var online = getServer().getPlayer(uuid);
            return online != null && online.hasPermission("robtic.tester");
        });
        TeleportService teleportService = new TeleportService(this, config.messages());
        particles = new ParticleService(this, survivalCache);
        premiumSync = new PremiumSyncService(this, permissions, config.premium(), survivalCache);
        StaffLogService staffLog = new StaffLogService(gateway, config.api(), config.logging(), getLogger());
        ChatBridgeService chat = new ChatBridgeService(gateway, config.api(), config.server(), config.messages());
        status = new StatusService(client, gateway, config.api(), config.server(), getLogger());

        // --- Staff services ------------------------------------------------------------------
        StaffChatService staffChat = new StaffChatService(gateway, config.api(), config.server(), config.messages());
        VanishService vanish = new VanishService(this, config.staff(), config.messages());
        StaffToolService tools = new StaffToolService(config.items(), config.messages());

        freeze = new FreezeService(this, gateway, config.api(), config.staff(), config.messages(), staffChat, staffLog);
        JailService jail = new JailService(
                this, gateway, config.api(), config.server(), config.staff(), config.messages(), staffChat, staffLog);

        staffMode = new StaffModeService(
                this, client, gateway, config.api(), config.server(), config.roles(), config.messages(),
                permissions, tools, staffChat, staffLog);

        // Wired after construction: staff chat and vanish both need to ask "is this player in
        // staff mode?", and the mode service needs both of them to already exist.
        staffChat.bindStaffModeCheck(staffMode::isInStaffMode);
        vanish.bindStaffModeCheck(staffMode::isInStaffMode);

        // --- Mailbox ---------------------------------------------------------------------------
        //
        // Built before the reports that write to it. Nothing is stored here: the API holds the mail,
        // because every message it carries is generated while the recipient is usually offline.
        mail = new MailService(this, gateway, config.api(), config.messages());
        mailMenu = new MailMenu(config.messages());

        getServer().getPluginManager().registerEvents(new MailMenuListener(this, mail, mailMenu), this);

        MailCommand mailCommand = new MailCommand(mail, mailMenu);
        bind("mail", mailCommand);

        // --- Report handling ---------------------------------------------------------------
        //
        // Availability is answered from staff mode and LuckPerms, both local, so it needs no cache.
        // The counters behind the placeholders do come from the database and are refreshed on a
        // timer by StaffStatsCache.
        staffAvailability = new StaffAvailabilityService(staffMode, permissions, config.roles());
        staffStats = new StaffStatsCache(this, client, config.api());

        lastSeen = new LastSeenLocations();

        ReportChatService reportChat = new ReportChatService(config.messages());
        reportService = new ReportService(
                this, gateway, config.api(), config.staff(), config.messages(), staffAvailability, reportChat,
                jail, lastSeen);

        getServer().getPluginManager().registerEvents(new ReportChatListener(this, reportChat), this);

        StaffMenuFactory menus = new StaffMenuFactory(
                config.messages(), config.staff(), config.lobbies(), freeze, jail, vanish, staffMode);
        StaffActionDispatcher dispatcher = new StaffActionDispatcher(
                config.messages(), menus, freeze, vanish, staffMode, staffLog);

        // Bound after the fact: the reports action needs a service that needs the jail, which needs
        // the staff chat that is built before these menus. See StaffActionDispatcher#bindReports.
        dispatcher.bindReports(reportService);

        // --- Economy GUI ---------------------------------------------------------------------
        ExchangeMenu menu = new ExchangeMenu(config.server().exchangeTitle(), config.server().exchangeRows());
        ExchangeController exchange = new ExchangeController(
                this, config.server(), config.messages(), menu, prices, players, robs);

        // Built after the auth module, so the bridge can hand it the events Discord sends when a
        // link completes or a password changes. Null there simply means those types are ignored.
        registerAuth();

        BridgeConsumerService consumer = new BridgeConsumerService(
                this, client, gateway, config.api(), chat, staffChat, prices, players, freeze, jail, auth);

        LeaderboardService leaderboard = new LeaderboardService(client, config.api(), getLogger());

        // --- AFK world -----------------------------------------------------------------------
        //
        // The reward service is built first and holds the statistics cache, because the AFK service
        // settles through it and the placeholders read from it. It reuses the economy's own balance
        // cache rather than keeping a second idea of what a player is worth.
        afkRewards = new AfkRewardService(this, gateway, survivalApi, balances, () -> afk.settings());
        afk = new AfkService(this, new AfkSettings(config.raw("afk.yml"), getLogger()), config.messages(), afkRewards);
        // Staff in /admin are working, not idle. Injected as a predicate so the AFK service never
        // needs to know what staff mode is.
        afk.exemptWhen(uuid -> afk.settings().exemptStaffMode() && staffMode.isInStaffMode(uuid));
        afk.load();

        // Built unconditionally, unlike the rest of the lobby module: AFK hides players too, and it
        // works on servers with no lobby at all. One service owns visibility either way — see
        // PlayerVisibilityService — so the two rules cannot end up undoing each other.
        visibility = new PlayerVisibilityService(this, config.lobby(), survivalCache);
        visibility.afkWhen(uuid -> afk.settings().hidePlayers() && afk.isAfk(uuid));
        afk.onVisibilityChanged(visibility::applyToAll);

        // The status line an AFK player sees. The loop starts with the first player to go AFK and
        // stops itself when the last one leaves, so an idle server schedules nothing.
        afkOverlay = new AfkOverlay(this, afk, afkRewards, config.messages());
        afk.onAfkStarted(afkOverlay::start);

        // A player waiting to authenticate is alone in the link world: they see nobody and nobody
        // sees them. Wired here rather than in registerAuth because the visibility service is built
        // with the AFK stack, and one service owns this question for both features.
        if (auth != null) {
            visibility.unauthenticatedWhen(uuid -> !auth.isAuthenticated(uuid));
            auth.onVisibilityChanged(visibility::applyToAll);
        }

        // Vanish joins the same pass rather than running its own.
        //
        // Four features decide who can see whom — the lobby toggle, AFK, authentication and vanish —
        // and while vanish computed its own pairs the last pass to run won. A vanished staff member
        // was revealed the moment anybody went AFK. One owner, one expression: see
        // PlayerVisibilityService#canSee.
        visibility.vanishWhen(vanish::isVanished, vanish::canSeeVanished);
        vanish.refreshVisibilityWith(visibility::applyToAll);
        vanish.teleportToGate(config.server()::staffSpawn, config.staff().vanishTeleportToGate());

        registerCommands(players, robs, exchange, staffChat, vanish, jail, menus, prices, leaderboard, permissions);
        registerSurvival(survivalApi, teleportService);
        registerLobby(survivalApi);
        registerListeners(chat, exchange, players, staffChat, tools, dispatcher, freeze, jail, vanish, menus, staffLog);
        AfkCommands afkCommands = new AfkCommands(this, afk, config.messages(),
                () -> {
                    config.reload();
                    afk.updateSettings(new AfkSettings(config.raw("afk.yml"), getLogger()));
                });
        bind("afk", afkCommands, afkCommands);
        getServer().getPluginManager().registerEvents(new AfkActivityListener(afk), this);

        // Before progression, which records into it.
        registerStatistics();

        // After statistics, which it records into; before progression, which will gate on it.
        registerLicenses(robs);

        // Before progression. Progression's workspace discovery consumes the structures this finds,
        // so its listener has to be registered by the time the first chunk loads.
        registerMarkers();

        registerProgression(robs, survivalCache);

        registerPlaceholders(players, leaderboard);
        startTasks(consumer, players, robs, leaderboard);

        freeze.startActionBarTask();
        connectInBackground(version);

        getLogger().info("Robtic Minecraft integration enabled (server \"" + config.api().serverId()
                + "\", API " + config.api().baseUrl() + ").");
    }

    @Override
    public void onDisable() {
        getServer().getScheduler().cancelTasks(this);

        if (freeze != null) {
            freeze.stop();
        }

        // Cleared before the restore below, which will end every session anyway — this only makes
        // sure nobody is left looking at a stale line during the shutdown itself.
        if (afkOverlay != null) {
            afkOverlay.stop();
        }

        // Saves synchronously, because the scheduler above has already been cancelled and an async
        // write issued now would never run.
        if (progression != null) {
            progression.disable();
        }

        if (licenses != null) {
            licenses.disable();
        }

        if (markers != null) {
            markers.disable();
        }

        // After progression and licences, both of which may record a final statistic as they stop.
        if (statistics != null) {
            statistics.disable();
        }

        // Before anything else saves: a player left in the lobby is a player whose real position
        // the server is about to overwrite with the lobby.
        if (afk != null) {
            afk.restoreAll();
        }

        // Ordered deliberately: restore every staff inventory first, because that is the only
        // thing here that cannot be recovered later. Everything after it is reporting.
        if (staffMode != null) {
            try {
                staffMode.restoreAll("shutdown");
            } catch (RuntimeException error) {
                getLogger().log(Level.SEVERE, "Failed to restore a staff inventory during shutdown", error);
            }
        }

        if (status != null) {
            try {
                status.reportStopped();
            } catch (RuntimeException error) {
                getLogger().log(Level.WARNING, "Failed to report shutdown", error);
            }
        }

        // Both persisted: a credit earned during an outage is owed to the player whether or not
        // the server stays up long enough to deliver it.
        if (queue != null) {
            queue.save();
        }

        if (balances != null) {
            balances.save();
        }
    }

    /**
     * Authenticates and downloads the startup bundle without blocking enable.
     *
     * A failure here is not fatal: the retry task keeps trying, and the plugin runs in a degraded
     * state until it succeeds rather than taking the server down with it.
     */
    private void connectInBackground(String version) {
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                gateway.client().authenticate(config.api().guildId());
                gateway.markAvailable(true);

                var bundle = gateway.get("/api/server/config", java.util.Map.of(
                        "guildId", config.api().guildId(),
                        "serverId", config.api().serverId()
                ));

                if (bundle.has("prices") && bundle.get("prices").isJsonArray()) {
                    var pricesArray = bundle.getAsJsonArray("prices");
                    getLogger().info("Loaded " + pricesArray.size() + " item price(s) from the Robtic API.");
                }


                // Pushed after authenticating and before the status report, so the bot has this
                // server's channels and toggles in hand by the time it is asked to render anything.
                pushConfiguration();

                status.reportStarted();
                getLogger().info("Authenticated with the Robtic API as \"" + config.api().serverId() + "\".");
            } catch (ApiException error) {
                gateway.markAvailable(false);

                if (error.isAuthFailure()) {
                    getLogger().severe("The Robtic API rejected this server's key: " + error.getMessage()
                            + " — check api.yml, then run /robtic reload.");
                } else {
                    getLogger().warning("Could not reach the Robtic API on startup: " + error.getMessage()
                            + " — retrying in the background.");
                }
            }
        });
    }

    private void registerCommands(
            PlayerDataService players,
            RobsService robs,
            ExchangeController exchange,
            StaffChatService staffChat,
            VanishService vanish,
            JailService jail,
            StaffMenuFactory menus,
            PriceService prices,
            LeaderboardService leaderboard,
            PermissionSyncService permissions
    ) {
        PlayerCommands playerCommands = new PlayerCommands(
                this, config.server(), config.messages(), gateway, players, robs, exchange, leaderboard);

        bind("link", playerCommands);
        bind("unlink", playerCommands);
        bind("robs", playerCommands);
        bind("exchange", playerCommands);

        StaffCommands staffCommands = new StaffCommands(
                this, config.api(), config.server(), config.messages(), gateway, config.roles(), players,
                staffMode, staffChat, freeze, jail, vanish, menus, permissions, roleSync, reportService);

        for (String name : new String[]{
                "admin", "a", "hide", "staff", "freeze", "jail", "unjail",
                "jail-set", "set-admin-gate", "jail-history", "warn", "warnings", "note", "notes", "report"
        }) {
            bind(name, staffCommands, staffCommands);
        }

        // Its own executor rather than another verb on StaffCommands: /fly is not a moderation
        // action, needs no staff mode, and its permission is deliberately separate.
        FlightCommand flightCommand = new FlightCommand(config.messages());
        bind("fly", flightCommand, flightCommand);

        // The roster commands read their ladder from RoleSettings, so nothing here names a rank.
        StaffRosterCommands rosterCommands = new StaffRosterCommands(
                gateway, config.api(), config.messages(), config.roles(), permissions, players, roleSync,
                staffAvailability);

        for (String name : new String[]{"addstaff", "promotestaff", "demotestaff", "setstaffrole", "firestaff"}) {
            bind(name, rosterCommands, rosterCommands);
        }

        RobticCommand admin = new RobticCommand(this, config, gateway, prices, status);
        bind("robtic", admin, admin);
    }

    /**
     * Wires RobticAuth: the state service, the restrictions and the link world.
     *
     * The login GUI is deliberately absent for now — {@link AuthService#promptWith} defaults to
     * doing nothing, so an unauthenticated player is restricted and told to log in but has no way to
     * yet. That is the correct intermediate state: the restrictions are what make showing a prompt
     * safe, so they land first and the surface that collects a password lands on top of them.
     */
    private void registerAuth() {
        AuthSettings authSettings = new AuthSettings(config.raw("auth.yml"), getLogger());

        if (!authSettings.enabled()) {
            getLogger().info("RobticAuth is disabled in auth.yml.");
            return;
        }

        auth = new AuthService(this, gateway.client(), gateway, config.api(), authSettings, config.messages());

        AuthRestrictionListener restrictions = new AuthRestrictionListener(auth, config.messages());
        getServer().getPluginManager().registerEvents(restrictions, this);
        getServer().getPluginManager().registerEvents(
                new AuthPlacementListener(this, auth, restrictions, config.messages()), this);

        // The surfaces a player can be asked on, best first.
        //
        // A native client dialog for Java, and chat capture for everything else. The chat surface
        // supports everybody, so it is registered last and the router is guaranteed to reach a
        // surface for every player — a player nothing supports is a player who cannot log in.
        //
        // The Bedrock form surface belongs between them, and is not built yet: it needs the
        // Floodgate API, which this build could not resolve. Bedrock players are still recognised
        // (see AuthPlatform) and fall through to chat, which their client handles fine.
        AuthPlatform platform = new AuthPlatform(this);
        AuthChatPrompt chatPrompt = new AuthChatPrompt(this, auth, config.messages());
        AuthDialogPrompt dialogPrompt = new AuthDialogPrompt(this, auth, platform, config.messages());

        AuthPromptRouter promptRouter = new AuthPromptRouter(this)
                .register(dialogPrompt)
                .register(chatPrompt);

        auth.promptWith(promptRouter::show);
        auth.dismissWith(dialogPrompt::dismiss);

        // Every dialog is built once here, before anybody can connect.
        //
        // The Dialog API validates at construction, and a screen that cannot be built shows a player
        // nothing at all — no error, no prompt, no way to log in. Finding that at boot rather than
        // when somebody joins is the difference between a console line and a locked-out player.
        if (platform.supportsDialogs() && !dialogPrompt.selfTest()) {
            getLogger().severe("One or more login dialogs failed to build (see above). Players who "
                    + "reach those screens will fall back to the chat prompt.");
        }

        // Registered before the restriction listener, which shares its priority: the capture has to
        // claim a password line before the "you must log in" refusal sees it.
        getServer().getPluginManager().registerEvents(new AuthChatListener(chatPrompt), this);

        // Asks for the password before the world loads, so an authenticated player never enters it
        // unauthenticated and none of the containment above ever applies to them. Registered only
        // when the server can actually render a dialog — on an older build there is nothing to show,
        // and holding the connection would lock everybody out.
        if (authSettings.preJoinLogin() && platform.supportsDialogs()) {
            getServer().getPluginManager().registerEvents(
                    new AuthConfigurationListener(this, auth, config.messages()), this);
            getLogger().info("Pre-join login is on: players are asked for their password before "
                    + "entering the world.");
        }

        AuthAdminCommands authCommands = new AuthAdminCommands(auth, config.messages());
        bind("auth", authCommands, authCommands);

        if (!platform.supportsDialogs()) {
            getLogger().warning("This server is older than Paper 1.21.7, so the Dialog API is "
                    + "unavailable and every player will log in through chat instead.");
        }

        // Frees a slot held by a client that joined and was abandoned at the login prompt. Not a
        // security measure — an unauthenticated player can already do nothing — so it runs on a
        // relaxed interval rather than every tick.
        if (authSettings.timeoutSeconds() > 0) {
            getServer().getScheduler().runTaskTimer(this, this::kickIdleUnauthenticated, 200L, 200L);
        }

        getLogger().info("RobticAuth enabled"
                + (authSettings.linkWorldName().isBlank()
                        ? " with no link world configured."
                        : " (link world \"" + authSettings.linkWorldName() + "\")."));
    }

    /** Disconnects anybody who has been sitting at the prompt past the configured timeout. */
    private void kickIdleUnauthenticated() {
        long timeoutMillis = auth.settings().timeoutSeconds() * 1000L;

        for (var player : getServer().getOnlinePlayers()) {
            if (auth.isAuthenticated(player.getUniqueId())) {
                continue;
            }

            auth.stateOf(player.getUniqueId())
                    .filter(state -> state.pendingMillis() >= timeoutMillis)
                    .ifPresent(state -> player.kick(
                            org.robtic.minecraft.config.MessageCatalog.render(
                                    config.messages().text("auth.kicked-timeout"))));
        }
    }

    /**
     * Wires the survival feature set: its commands, its two listeners and the particle task.
     *
     * Kept apart from {@link #registerCommands} because it is a self-contained subsystem — every
     * object here depends only on the survival cache and the shared gateway, so it can be read,
     * changed or disabled without touching the staff or economy wiring.
     */
    private void registerSurvival(SurvivalApi survivalApi, TeleportService teleportService) {
        HomesMenu homesMenu = new HomesMenu(config.messages());
        FriendsMenu friendsMenu = new FriendsMenu(config.messages());
        ParticleMenu particleMenu = new ParticleMenu(config.messages());
        profileMenu = new ProfileMenu(config.messages(), mail, afk, afkRewards);

        friendTeleports = new FriendTeleportService(this, config.messages(), teleportService);

        SpawnCommands spawnCommands = new SpawnCommands(gateway, config.messages(), survivalCache, teleportService);
        HomeCommands homeCommands = new HomeCommands(gateway, config.messages(), survivalCache, teleportService, homesMenu);
        BackCommand backCommand = new BackCommand(gateway, config.messages(), survivalCache, teleportService);
        ChestCommands chestCommands = new ChestCommands(gateway, config.messages(), survivalCache);
        ProfileCommand profileCommand = new ProfileCommand(gateway, config.messages(), survivalCache, profileMenu);
        CosmeticCommands cosmeticCommands = new CosmeticCommands(gateway, config.messages(), survivalCache, particleMenu);
        FriendCommands friendCommands =
                new FriendCommands(gateway, config.messages(), survivalCache, friendTeleports, friendsMenu);

        bind("spawn", spawnCommands);
        bind("setspawn", spawnCommands);

        for (String name : new String[]{"sethome", "home", "homes", "delhome", "renamehome"}) {
            bind(name, homeCommands, homeCommands);
        }

        bind("back", backCommand);

        for (String name : new String[]{"lock", "unlock", "locks", "ec", "linkchest", "chest"}) {
            bind(name, chestCommands);
        }

        bind("profile", profileCommand);

        for (String name : new String[]{"particle", "joinmessage", "leavemessage"}) {
            bind(name, cosmeticCommands);
        }

        bind("friend", friendCommands, friendCommands);
        bind("friends", friendCommands, friendCommands);

        getServer().getPluginManager().registerEvents(new SurvivalListener(
                this, gateway, survivalApi, config.messages(), survivalCache, teleportService, friendTeleports,
                premiumSync), this);

        getServer().getPluginManager().registerEvents(new SurvivalMenuListener(
                config.messages(), survivalCache, teleportService, friendTeleports, friendCommands, cosmeticCommands,
                mail, mailMenu), this);

        particles.start();

        // The spawn point is server-wide and never changes on its own, so it is fetched once here
        // and /spawn reads it from memory for the rest of the server's life.
        getServer().getScheduler().runTaskAsynchronously(this, survivalCache::loadSpawn);
    }

    /**
     * Wires the lobby module.
     *
     * Everything the lobby shows is built on services that already exist — the survival cache, the
     * friend teleport service and the profile menu are reused rather than re-created, which is what
     * keeps a friend added in the lobby the same friendship as one added with `/friend add`.
     */
    private void registerLobby(SurvivalApi survivalApi) {
        LobbyConfiguration lobbyConfig = config.lobby();

        if (!lobbyConfig.enabled()) {
            getLogger().info("The lobby module is disabled in lobby.yml.");
            return;
        }

        LobbyItems lobbyItems = new LobbyItems(this, lobbyConfig);
        LobbyMenus lobbyMenus = new LobbyMenus(lobbyConfig, config.messages());
        LobbyNotifications notifications = new LobbyNotifications(this, config.messages());

        // The one built alongside the AFK service, not a second copy. Two visibility services would
        // each hide players the other had just shown.
        PlayerVisibilityService visibilityService = visibility;

        lobbyManager = new LobbyManager(
                this, lobbyConfig, lobbyItems, survivalCache, visibilityService, notifications);

        LobbyPlayerInteraction interaction = new LobbyPlayerInteraction(
                this, lobbyConfig, config.messages(), gateway, survivalCache, lobbyMenus, notifications, lobbyItems);

        getServer().getPluginManager().registerEvents(new LobbyListener(
                this, lobbyConfig, lobbyManager, survivalCache, notifications, visibilityService), this);

        getServer().getPluginManager().registerEvents(
                new LobbyRestrictions(lobbyConfig, lobbyItems, config.messages()), this);

        getServer().getPluginManager().registerEvents(new LobbyMenuListener(
                this, lobbyConfig, lobbyItems, lobbyMenus, interaction, notifications, visibilityService,
                config.messages(), gateway, survivalCache, friendTeleports, profileMenu), this);

        LobbyCommands lobbyCommands = new LobbyCommands(
                gateway, config.messages(), lobbyConfig, survivalCache, visibilityService, lobbyMenus);

        bind("players", lobbyCommands);
        bind("settings", lobbyCommands);

        getLogger().info("Lobby module enabled for world \"" + lobbyConfig.world() + "\".");
    }

    private void registerListeners(
            ChatBridgeService chat,
            ExchangeController exchange,
            PlayerDataService players,
            StaffChatService staffChat,
            StaffToolService tools,
            StaffActionDispatcher dispatcher,
            FreezeService freezeService,
            JailService jail,
            VanishService vanish,
            StaffMenuFactory menus,
            StaffLogService staffLog
    ) {
        PluginManager manager = getServer().getPluginManager();

        manager.registerEvents(new PlayerConnectionListener(
                this, gateway.client(), gateway, config.api(), config.server(), config.messages(),
                players, staffMode, staffChat, tools, freezeService, jail, vanish, roleSync, mail, afkRewards,
                lastSeen), this);

        manager.registerEvents(new PlayerChatListener(this, chat), this);
        manager.registerEvents(new ExchangeMenuListener(exchange, config.server().exchangeRows()), this);
        manager.registerEvents(new RestrictionListener(freezeService, jail, config.staff(), config.messages()), this);

        if (config.server().staffSystemEnabled()) {
            manager.registerEvents(new StaffToolListener(tools, dispatcher, staffMode), this);
            manager.registerEvents(new StaffMenuListener(
                    menus, dispatcher, freezeService, jail, config.lobbies(), config.messages(), staffLog,
                    reportService), this);
        }

        if (config.server().npcEnabled() && !config.server().npcNames().isEmpty()) {
            manager.registerEvents(new NpcInteractListener(exchange, config.server().npcNames()), this);

            // Entity-backed NPCs are covered by the listener above. FancyNpcs NPCs are not
            // entities at all, so they need their own plugin's event — see NpcHooks.
            NpcHooks.register(this, exchange, config.server().npcNames());
        }
    }

    /**
     * Builds and enables the jobs and titles system.
     *
     * <h2>Everything it needs from this plugin arrives as a function</h2>
     *
     * The premium tier, the tester check and the economy are all injected. The progression package
     * therefore has no compile dependency on the survival module, the Robs service or the premium
     * cache — which is what makes "move the package into its own plugin" a real option rather than
     * an aspiration.
     *
     * <h2>Storage</h2>
     *
     * Local files by default. The API-backed implementation is the intended destination and is
     * written, but its routes do not exist on the server yet; pointing at them now would mean every
     * save failing and the repository refusing to write. {@code storage: api} in jobs.yml switches
     * over once they are deployed, and the two speak the same JSON so existing files migrate.
     */
    /**
     * Starts the statistics system.
     *
     * <h2>Backend</h2>
     *
     * Local files by default, for the same reason progression uses them: the API-backed
     * implementation is written and its routes are not deployed yet, so pointing at them now would
     * mean every save failing and the repository refusing to write. {@code storage: api} in
     * statistics.yml switches over once they exist, and the two speak the same JSON.
     *
     * <h2>Contained</h2>
     *
     * A failure here must not stop the server. Statistics are read by nearly everything, so every
     * caller already tolerates a system that is not recording — and a broken {@code statistics.yml}
     * taking down the chat bridge and the economy would be a spectacularly bad trade.
     */
    private void registerStatistics() {
        try {
            String backend = config.raw("statistics.yml").getString("statistics.storage", "file");

            org.robtic.minecraft.statistics.storage.StatisticsStorage storage =
                    "api".equalsIgnoreCase(backend)
                            ? new org.robtic.minecraft.statistics.storage.ApiStatisticsStorage(
                                    gateway.client(), config::api)
                            : new org.robtic.minecraft.statistics.storage.FileStatisticsStorage(
                                    getDataFolder().toPath().resolve("statistics"));

            statistics = new org.robtic.minecraft.statistics.StatisticsSystem(
                    this, storage, () -> config.raw("statistics.yml"));

            statistics.enable();
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(Level.SEVERE, "The statistics system failed to start. Nothing will be "
                    + "recorded; every other system is unaffected and stored values are untouched.",
                    failure);
            statistics = null;
        }
    }

    /**
     * Starts the licence system.
     *
     * <h2>Contained</h2>
     *
     * A failure here must not stop the server. Licences gate features rather than providing them, so
     * every future caller already has to handle "no licence" — and a broken {@code licenses.yml}
     * taking down the chat bridge and the economy would be a spectacularly bad trade.
     *
     * <h2>Statistics and the economy are handed in, not looked up</h2>
     *
     * Both are optional. Without statistics nothing is counted; without an economy renewals are
     * refused rather than silently free. The module compiles and runs with neither, which is what
     * makes it liftable into its own plugin later.
     */
    private void registerLicenses(RobsService robs) {
        try {
            licenses = new org.robtic.minecraft.license.LicenseSystem(
                    this, config.messages(), () -> config.raw("licenses.yml"));

            if (statistics != null) {
                licenses.statistics(statistics.service());
            }

            // The same Robs service the rest of the plugin charges through. Blocking, and called off
            // the main thread by the renewal flow.
            licenses.economy((uuid, username, amount, reason) -> {
                try {
                    robs.adjust(uuid, username, -amount, false, reason);
                    return true;
                } catch (RuntimeException failure) {
                    getLogger().warning("A licence renewal could not be charged for " + username
                            + ": " + failure.getMessage());
                    return false;
                }
            });

            licenses.enable();
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(Level.SEVERE, "The licence system failed to start. Licences are"
                    + " unavailable; everything else is unaffected and no player item was touched.",
                    failure);

            licenses = null;
        }
    }

    /**
     * Starts the building marker system.
     *
     * <h2>Contained, like the others</h2>
     *
     * A broken {@code markers.yml} means structures are not discovered. It must not mean the chat
     * bridge, the economy and the staff tools are gone too, so the failure is caught and named here
     * rather than being allowed to abort the enable.
     *
     * <h2>Nothing is injected into it</h2>
     *
     * The marker system depends on no other system in this plugin, which is what makes it usable by
     * future ones. It reads a config file, watches for structures and fires an event; whoever cares
     * about workspaces, dungeons or guild halls listens for that event and decides what the building
     * is.
     */
    private void registerMarkers() {
        try {
            markers = new org.robtic.minecraft.structure.StructureMarkerSystem(
                    this, () -> config.raw("markers.yml"), config::reload);

            markers.enable();
        } catch (RuntimeException | LinkageError failure) {
            getLogger().log(Level.SEVERE, "The building marker system failed to start. Structures"
                    + " will not be discovered; everything else is unaffected and no marker already"
                    + " placed in a schematic was touched.", failure);

            markers = null;
        }
    }

    /**
     * The building marker system, for a module registering marker types of its own.
     *
     * @return null when it failed to start — a caller adding marker types must tolerate that, in the
     *         same way every optional hook in this plugin is tolerated
     */
    public org.robtic.minecraft.structure.StructureMarkerSystem markers() {
        return markers;
    }

    private void registerProgression(RobsService robs, SurvivalCacheService survivalCacheService) {
        try {
            String backend = config.raw("jobs.yml").getString("storage", "file");

            org.robtic.minecraft.progression.storage.ProgressionStorage storage =
                    "api".equalsIgnoreCase(backend)
                            ? new org.robtic.minecraft.progression.storage.ApiProgressionStorage(
                                    gateway.client(), config::api)
                            : new org.robtic.minecraft.progression.storage.FileProgressionStorage(
                                    getDataFolder().toPath().resolve("progression"), getLogger());

            progression = new org.robtic.minecraft.progression.ProgressionSystem(
                    this,
                    config.messages(),
                    storage,
                    () -> config.raw("titles.yml"),
                    () -> config.raw("jobs.yml"),
                    () -> config.raw("npc.yml"),
                    () -> config.raw("workspace.yml"),
                    // The premium tier, read from the entitlements this plugin already caches. A
                    // memory read, because unlock conditions consult it on every GUI redraw.
                    uuid -> survivalCacheService.cachedPremium(uuid).level(),
                    uuid -> {
                        org.bukkit.entity.Player player = getServer().getPlayer(uuid);
                        return player != null && player.hasPermission("robtic.tester");
                    });

            // Before enable, which is where the recorder is registered as a workspace extension and
            // a listener. Null when the statistics system failed to start, and progression runs
            // exactly as before in that case.
            if (statistics != null) {
                progression.statistics(statistics.service());
            }

            // The economy, wired to the existing Robs service. Blocking, and called off the main
            // thread by the sell flow.
            progression.economy((uuid, username, amount, reason) -> {
                try {
                    robs.adjust(uuid, username, amount, true, reason);
                    return true;
                } catch (RuntimeException failure) {
                    getLogger().warning("A job sale could not be paid for " + username
                            + ": " + failure.getMessage());
                    return false;
                }
            });

            progression.enable();
        } catch (RuntimeException | LinkageError failure) {
            // Contained. A broken progression config must not stop the chat bridge, the economy and
            // the staff tools from starting — those are what the server actually runs on.
            getLogger().log(Level.SEVERE, "The progression system failed to start. "
                    + "Jobs and titles are unavailable; everything else is unaffected.", failure);
            progression = null;
        }
    }

    /**
     * Publishes the placeholders, when PlaceholderAPI is installed.
     *
     * Guarded by a plugin lookup rather than a try/catch: the expansion's superclass comes from
     * PlaceholderAPI, so merely constructing it on a server without it would throw
     * NoClassDefFoundError. Checking first keeps that class from ever being loaded.
     */
    private void registerPlaceholders(PlayerDataService players, LeaderboardService leaderboard) {
        if (getServer().getPluginManager().getPlugin("PlaceholderAPI") == null) {
            getLogger().info("PlaceholderAPI is not installed — %robtic_…% placeholders are unavailable.");
            return;
        }

        try {
            RobticPlaceholders expansion = new RobticPlaceholders(this, players, balances,
                    config.roles(), leaderboard, roleSync, staffAvailability, staffStats, afk, afkRewards);

            // Jobs and titles publish under the same `robtic_` identifier rather than a second one.
            // PlaceholderAPI allows one expansion per identifier, and a separate one would mean
            // %robticjobs_job% sitting next to %robtic_robs% in every config on the server.
            if (progression != null) {
                expansion.extend(progression.placeholders());
            }

            // Registered after progression's, so a %robtic_stat_…% key cannot be shadowed by one of
            // its prefixes — and every registered statistic resolves without being named here.
            if (statistics != null) {
                expansion.extend(new org.robtic.minecraft.statistics.StatisticsPlaceholders(
                        statistics.service()));
            }

            if (licenses != null) {
                expansion.extend(licenses.placeholders());
            }

            expansion.register();
            getLogger().info("Registered the %robtic_…% placeholders with PlaceholderAPI.");
        } catch (RuntimeException | LinkageError error) {
            getLogger().log(Level.WARNING, "Could not register the Robtic placeholders", error);
        }
    }

    private void startTasks(
            BridgeConsumerService consumer,
            PlayerDataService players,
            RobsService robs,
            LeaderboardService leaderboard
    ) {
        long poll = config.api().pollTicks();
        long heartbeat = config.api().heartbeatTicks();
        long retry = config.api().retryIntervalTicks();
        long placeholders = config.api().placeholderRefreshTicks();

        getServer().getScheduler().runTaskTimerAsynchronously(this, consumer::poll, poll, poll);

        // Main thread: it teleports. Nothing is scanned per tick — see AfkService#sweep.
        long afkInterval = afk.settings().checkIntervalTicks();
        getServer().getScheduler().runTaskTimer(this, afk::sweep, afkInterval, afkInterval);

        // Keeps the caches the placeholders read warm.
        //
        // Nothing else refreshes a profile or a balance on a schedule — they are fetched when a
        // player joins or runs a command, which is enough for a command and not enough for a tab
        // list that re-renders every second off whatever is in memory. This is the task that makes
        // "cached" mean "recent" rather than "whenever they last typed /bal", and it is also
        // what keeps the staff-rank answer current without a Discord lookup per placeholder.
        getServer().getScheduler().runTaskTimerAsynchronously(
                this, () -> warmCaches(players, robs, leaderboard), placeholders, placeholders);

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

        // Report counters for the staff placeholders. One request per interval, never per tick.
        staffStats.start(staffAvailability);
    }

    /**
     * Refreshes the caches the placeholders read, plus the leaderboard. Runs on a worker.
     *
     * <h2>What this pass costs</h2>
     *
     * Balances are fetched for everyone in <em>one</em> request rather than one per player, which
     * is the single biggest reduction in this plugin's traffic — a 60-player server went from 60
     * requests a pass to one.
     *
     * Profiles still refresh individually, but {@link PlayerDataService#profile} serves from cache
     * while fresh, so the number of actual requests is governed by the profile TTL rather than by
     * how often this task runs.
     *
     * Staff rank is absent from this method entirely: it now comes from LuckPerms, in memory, and
     * costs nothing to keep current.
     *
     * Failures are swallowed per player on purpose: one unresolvable player must not stop the rest
     * of the pass, and every service falls back to its cached value.
     */
    private void warmCaches(PlayerDataService players, RobsService robs, LeaderboardService leaderboard) {
        List<UUID> online = new ArrayList<>();

        for (var player : getServer().getOnlinePlayers()) {
            online.add(player.getUniqueId());

            try {
                players.profile(player.getUniqueId(), player.getName());
            } catch (ApiException error) {
                getLogger().fine("Profile warm-up failed for " + player.getName() + ": " + error.getMessage());
            }
        }

        robs.refreshBalances(online);

        // Sends only the players whose groups actually moved, as one request. Usually there are
        // none, in which case this makes no request at all.
        roleSync.flush();

        leaderboard.refresh();
    }

    /**
     * Sends this server's configuration to the API. Safe to call from any thread.
     *
     * Public because `/robtic reload` calls it too: re-reading the files without publishing them
     * would leave the bot acting on the previous channels and prices, which is exactly the sort of
     * "I changed it and nothing happened" that the reload is meant to avoid.
     */
    public void pushConfiguration() {
        getServer().getScheduler().runTaskAsynchronously(this, () -> configPush.push(
                config.raw("config.yml"), config.raw("roles.yml"), config.raw("prices.yml"), config.premium()));
    }

    private void bind(String name, CommandExecutor executor) {
        bind(name, executor, null);
    }

    private void bind(String name, CommandExecutor executor, TabCompleter completer) {
        PluginCommand command = getCommand(name);

        if (command == null) {
            getLogger().warning("Command \"" + name + "\" is missing from plugin.yml");
            return;
        }

        command.setExecutor(executor);
        if (completer != null) {
            command.setTabCompleter(completer);
        }
    }
}
