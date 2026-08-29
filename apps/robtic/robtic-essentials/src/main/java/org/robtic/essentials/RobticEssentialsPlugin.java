package org.robtic.essentials;

import org.bukkit.command.CommandExecutor;
import org.bukkit.command.TabCompleter;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.RobticCorePlugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.cache.BalanceCache;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.entitlement.EntitlementSource;
import org.robtic.core.mail.MailboxService;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.RobticServices;
import org.robtic.core.staff.StaffPresence;
import org.robtic.essentials.afk.AfkOverlay;
import org.robtic.essentials.afk.AfkRewardService;
import org.robtic.essentials.afk.AfkService;
import org.robtic.essentials.afk.AfkSettings;
import org.robtic.essentials.lobby.LobbyConfiguration;
import org.robtic.essentials.lobby.PlayerVisibilityService;
import org.robtic.essentials.survival.CachedEntitlements;
import org.robtic.essentials.survival.SurvivalApi;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.TeleportService;
import org.robtic.essentials.survival.command.BackCommand;
import org.robtic.essentials.survival.command.ChestCommands;
import org.robtic.essentials.survival.command.HomeCommands;
import org.robtic.essentials.survival.command.ProfileCommand;
import org.robtic.essentials.survival.command.SpawnCommands;
import org.robtic.essentials.survival.cosmetic.CosmeticCommands;
import org.robtic.essentials.survival.cosmetic.ParticleService;
import org.robtic.essentials.survival.friend.FriendCommands;
import org.robtic.essentials.survival.friend.FriendTeleportService;
import org.robtic.essentials.survival.gui.FriendsMenu;
import org.robtic.essentials.survival.gui.HomesMenu;
import org.robtic.essentials.survival.gui.ParticleMenu;
import org.robtic.essentials.survival.gui.ProfileMenu;
import org.robtic.essentials.survival.listener.SurvivalListener;
import org.robtic.essentials.survival.listener.SurvivalMenuListener;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.logging.Level;

/**
 * RobticEssentials: the everyday player features.
 *
 * Homes, spawn, back, friends, the ender chest, chest locks, cosmetics, join and leave messages, the
 * lobby world and AFK. Everything a player does that is not a profession, a licence or a moderation
 * action.
 *
 * <h2>The third dependency cycle ended here</h2>
 *
 * {@code afk} ↔ {@code survival} was a cycle because the AFK reward service reads the survival API
 * and the profile menu shows AFK statistics. Both are in this plugin now, so — like the two that
 * ended in RobticStaff — the cycle is dissolved rather than broken: there is no boundary left for it
 * to cross.
 *
 * <h2>Premium is not here, and is not depended on</h2>
 *
 * Every feature in this plugin works for every player. Premium raises limits — more homes, more
 * {@code /back} uses, more locked chests, a portable ender chest, cosmetics — and those limits are
 * read from {@link org.robtic.core.entitlement.Entitlements}, which the survival cache already
 * fetches on join as part of a request that had to happen anyway.
 *
 * So this plugin <em>publishes</em> {@link EntitlementSource} rather than consuming anything from
 * RobticPremium. Without that plugin nobody applies premium LuckPerms groups and every command still
 * works at its free limits — which is why moving {@code /back} or {@code /particle} into
 * RobticPremium would have been wrong: it would have deleted them for free players.
 *
 * <h2>Two optional collaborators, both degrading to nothing</h2>
 *
 * RobticMail supplies the profile menu's mailbox button through Core's {@link MailboxService};
 * RobticStaff answers {@link StaffPresence} so staff in {@code /admin} are exempt from the AFK timer.
 * Absent, the button is not drawn and nobody is exempt. Neither is imported.
 */
public final class RobticEssentialsPlugin extends RobticPlugin {

    private SurvivalCacheService cache;
    private ParticleService particles;

    private AfkService afk;
    private AfkRewardService afkRewards;
    private AfkOverlay afkOverlay;

    private PlayerVisibilityService visibility;

    /** Built by the survival wiring and reused by the lobby, so a friend added in either is the same friendship. */
    private FriendTeleportService friendTeleports;
    private ProfileMenu profileMenu;
    private LobbyConfiguration lobbyConfig;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.optional("RobticMail",
                        "the profile menu will not show a mailbox button"),
                PluginDependency.optional("RobticStaff",
                        "staff in /admin will not be exempted from the AFK timer"));
    }

    @Override
    protected void start() {
        RobticCorePlugin core = core();

        ApiGateway gateway = require(ApiGateway.class);
        MessageCatalog messages = core.config().messages();

        SurvivalApi survivalApi = new SurvivalApi(gateway.client(), core.config().api());

        cache = new SurvivalCacheService(survivalApi, core.config().server().freeHomeLimit());

        // `robtic.tester` lifts every premium limit this server enforces, so staff can exercise a
        // paid feature without buying it. Premium is not a permission, so it is short-circuited here
        // rather than expressed as one.
        cache.testerWhen(uuid -> {
            var online = getServer().getPlayer(uuid);
            return online != null && online.hasPermission("robtic.tester");
        });

        // Published before anything else, so RobticPremium — which enables after this plugin — finds
        // a source the moment it looks. See CachedEntitlements for why Essentials is the holder.
        RobticServices.register(this, EntitlementSource.class, new CachedEntitlements(cache));

        TeleportService teleports = new TeleportService(this, messages);

        startAfk(gateway, survivalApi, messages);
        startVisibility();

        particles = new ParticleService(this, cache);

        registerSurvival(gateway, survivalApi, messages, teleports);

        // After survival, which builds the friend teleports and the profile menu the lobby reuses.
        registerLobby(gateway, messages);

        particles.start();

        // The spawn point is server-wide and never changes on its own, so it is fetched once here
        // and /spawn reads it from memory for the rest of the server's life.
        //
        // Guarded, because an unreachable API at startup is a state this ecosystem is built to
        // survive — there is an entire offline queue for it. An exception escaping a scheduler task
        // is handed to Bukkit, which prints a full stack trace naming this plugin as having
        // "generated an exception", on every start until the API returns. The actual cost of failing
        // is one cached value, and /spawn falls back to the world spawn without it.
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                cache.loadSpawn();
            } catch (RuntimeException unreachable) {
                getLogger().fine("Could not load the server spawn point: " + unreachable.getMessage()
                        + ". /spawn will use the world spawn until the API is reachable.");
            }
        });

        getLogger().info("RobticEssentials ready"
                + (mailbox() == null ? " (no RobticMail — mailbox button hidden)." : "."));
    }

    /**
     * The survival feature set: menus, commands and the two listeners.
     *
     * Every command keeps the name and aliases it had in RobticMinecraft 3.x.
     */
    private void registerSurvival(
            ApiGateway gateway,
            SurvivalApi survivalApi,
            MessageCatalog messages,
            TeleportService teleports
    ) {
        HomesMenu homesMenu = new HomesMenu(messages);
        FriendsMenu friendsMenu = new FriendsMenu(messages);
        ParticleMenu particleMenu = new ParticleMenu(messages);

        profileMenu = new ProfileMenu(messages, mailbox(), afk, afkRewards);

        friendTeleports = new FriendTeleportService(this, messages, teleports);

        SpawnCommands spawn = new SpawnCommands(gateway, messages, cache, teleports);
        HomeCommands homes = new HomeCommands(gateway, messages, cache, teleports, homesMenu);
        BackCommand back = new BackCommand(gateway, messages, cache, teleports);
        ChestCommands chests = new ChestCommands(gateway, messages, cache);
        ProfileCommand profile = new ProfileCommand(gateway, messages, cache, profileMenu);
        CosmeticCommands cosmetics = new CosmeticCommands(gateway, messages, cache, particleMenu);
        FriendCommands friends =
                new FriendCommands(gateway, messages, cache, friendTeleports, friendsMenu);

        bind("spawn", spawn, null);
        bind("setspawn", spawn, null);

        for (String name : List.of("sethome", "home", "homes", "delhome", "renamehome")) {
            bind(name, homes, homes);
        }

        bind("back", back, null);

        for (String name : List.of("lock", "unlock", "locks", "ec", "linkchest", "chest")) {
            bind(name, chests, null);
        }

        bind("profile", profile, null);

        for (String name : List.of("particle", "joinmessage", "leavemessage")) {
            bind(name, cosmetics, null);
        }

        bind("friend", friends, friends);
        bind("friends", friends, friends);

        getServer().getPluginManager().registerEvents(new SurvivalListener(
                this, gateway, survivalApi, messages, cache, teleports, friendTeleports), this);

        getServer().getPluginManager().registerEvents(new SurvivalMenuListener(
                messages, cache, teleports, friendTeleports, friends, cosmetics, mailbox()), this);
    }

    /**
     * AFK and its rewards.
     *
     * The reward service is built first and holds the statistics cache, because the AFK service
     * settles through it and the placeholders read from it. It reuses Core's balance cache rather
     * than keeping a second idea of what a player is worth.
     */
    private void startAfk(ApiGateway gateway, SurvivalApi survivalApi, MessageCatalog messages) {
        BalanceCache balances = RobticServices.find(BalanceCache.class).orElse(null);

        afkRewards = new AfkRewardService(this, gateway, survivalApi, balances, () -> afk.settings());
        afk = new AfkService(this, new AfkSettings(read("afk.yml"), getLogger()), messages, afkRewards);

        // Staff in /admin are working, not idle. Resolved per call rather than captured, because
        // RobticStaff enables independently and may register after this predicate is built.
        afk.exemptWhen(uuid -> afk.settings().exemptStaffMode() && actingAsStaff(uuid));
        afk.load();

        afkOverlay = new AfkOverlay(this, afk, afkRewards, messages);

        // The overlay is not a timer that polls — it starts when somebody actually goes AFK, and the
        // service tells it. Without this hook it is constructed and never runs, which is why the
        // action bar showed nothing and the robs total never appeared.
        afk.onAfkStarted(afkOverlay::start);

        // What clears AFK again: movement, chat, an interaction. Without this listener a player goes
        // AFK and never comes back, no matter what they do.
        getServer().getPluginManager().registerEvents(
                new org.robtic.essentials.afk.AfkActivityListener(afk), this);

        // /afk, and the admin verbs behind it.
        org.robtic.essentials.afk.AfkCommands commands =
                new org.robtic.essentials.afk.AfkCommands(this, afk, messages, this::reloadAfk);

        bind("afk", commands, commands);

        // The sweep that actually detects idleness. Main thread, because going AFK teleports the
        // player; nothing is scanned per tick — see AfkService#sweep.
        long interval = afk.settings().checkIntervalTicks();

        getServer().getScheduler().runTaskTimer(this, afk::sweep, interval, interval);

        // Seeds the running totals from the join document Core publishes, so the first settlement of
        // a session is measured against the real figure rather than against zero.
        getServer().getPluginManager().registerEvents(
                new org.robtic.essentials.afk.AfkConnectionListener(afkRewards), this);

        // Contributed to Core's single expansion rather than registering one of its own.
        RobticServices.find(org.robtic.core.placeholder.RobticPlaceholders.class).ifPresent(
                expansion -> expansion.extend(
                        new org.robtic.essentials.afk.AfkPlaceholders(afk, afkRewards)));

        RobticServices.register(this, AfkService.class, afk);
        RobticServices.register(this, AfkRewardService.class, afkRewards);
    }

    /** Re-reads afk.yml, for {@code /afk reload}. */
    private void reloadAfk() {
        afk.updateSettings(new AfkSettings(read("afk.yml"), getLogger()));
    }

    /**
     * The lobby module.
     *
     * <h2>Everything here is built on services that already exist</h2>
     *
     * The survival cache, the friend teleport service and the profile menu are reused rather than
     * re-created — which is what keeps a friend added in the lobby the same friendship as one added
     * with {@code /friend add}, and why this runs after {@link #registerSurvival}.
     *
     * <h2>Skipped entirely when disabled</h2>
     *
     * A server with no lobby world sets {@code enabled: false} and none of this is registered. The
     * visibility service is the exception — it is built unconditionally in
     * {@link #startVisibility}, because AFK hides players too and that works with no lobby at all.
     */
    private void registerLobby(ApiGateway gateway, MessageCatalog messages) {
        if (!lobbyConfig.enabled()) {
            getLogger().info("The lobby module is disabled in lobby.yml.");
            return;
        }

        var items = new org.robtic.essentials.lobby.LobbyItems(this, lobbyConfig);
        var menus = new org.robtic.essentials.lobby.gui.LobbyMenus(lobbyConfig, messages);
        var notifications = new org.robtic.essentials.lobby.LobbyNotifications(this, messages);

        var manager = new org.robtic.essentials.lobby.LobbyManager(
                this, lobbyConfig, items, cache, visibility, notifications);

        var interaction = new org.robtic.essentials.lobby.LobbyPlayerInteraction(
                this, lobbyConfig, messages, gateway, cache, menus, notifications, items);

        var manager2 = getServer().getPluginManager();

        manager2.registerEvents(new org.robtic.essentials.lobby.LobbyListener(
                this, lobbyConfig, manager, cache, notifications, visibility), this);

        manager2.registerEvents(new org.robtic.essentials.lobby.LobbyRestrictions(
                lobbyConfig, items, messages), this);

        manager2.registerEvents(new org.robtic.essentials.lobby.LobbyMenuListener(
                this, lobbyConfig, items, menus, interaction, notifications, visibility,
                messages, gateway, cache, friendTeleports, profileMenu), this);

        var commands = new org.robtic.essentials.lobby.command.LobbyCommands(
                gateway, messages, lobbyConfig, cache, visibility, menus);

        bind("players", commands, null);
        bind("settings", commands, null);

        getLogger().info("Lobby module enabled for world \"" + lobbyConfig.world() + "\".");
    }

    /**
     * Visibility, owned by one service whatever the reason a player is hidden.
     *
     * Built unconditionally, unlike the rest of the lobby module: AFK hides players too, and works on
     * servers with no lobby at all. One service owns visibility either way, so the two rules cannot
     * end up undoing each other.
     */
    private void startVisibility() {
        lobbyConfig = LobbyConfiguration.parse(read("lobby.yml"), getLogger());

        visibility = new PlayerVisibilityService(this, lobbyConfig, cache);
        visibility.afkWhen(uuid -> afk.settings().hidePlayers() && afk.isAfk(uuid));

        afk.onVisibilityChanged(visibility::applyToAll);
    }

    @Override
    protected void stop() {
        if (afkOverlay != null) {
            afkOverlay.stop();
        }

        if (afk != null) {
            afk.save();
        }
    }

    // ─── Optional collaborators ───────────────────────────────────────────────────────────────

    /** The mailbox, or null when RobticMail is not installed. */
    private MailboxService mailbox() {
        return RobticServices.find(MailboxService.class).orElse(null);
    }

    /** Whether a player is on duty. False when RobticStaff is not installed — see {@link StaffPresence}. */
    private boolean actingAsStaff(UUID player) {
        return RobticServices.findOr(StaffPresence.class, StaffPresence.NONE).isActingAsStaff(player);
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private void bind(String name, CommandExecutor executor, TabCompleter completer) {
        var command = getServer().getPluginCommand(name);

        if (command == null) {
            // One missing entry costs one command, not the plugin.
            getLogger().warning("The command \"" + name + "\" is not declared in plugin.yml,"
                    + " so it will not work.");
            return;
        }

        command.setExecutor(executor);

        if (completer != null) {
            command.setTabCompleter(completer);
        }
    }

    private <T> T require(Class<T> contract) {
        return RobticServices.find(contract).orElseThrow(() -> new IllegalStateException(
                "RobticCore did not register " + contract.getSimpleName() + "."));
    }

    private RobticCorePlugin core() {
        var found = getServer().getPluginManager().getPlugin("RobticCore");

        if (found instanceof RobticCorePlugin plugin) {
            return plugin;
        }

        throw new IllegalStateException("RobticCore is not the plugin this was compiled against.");
    }

    private FileConfiguration read(String name) {
        File file = new File(getDataFolder(), name);

        if (!file.exists()) {
            saveResource(name, false);
        }

        FileConfiguration configuration = YamlConfiguration.loadConfiguration(file);

        try (var stream = getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(YamlConfiguration.loadConfiguration(
                        new InputStreamReader(stream, StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            getLogger().log(Level.WARNING, "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    public SurvivalCacheService cache() {
        return cache;
    }

    public AfkService afk() {
        return afk;
    }

    public LobbyConfiguration lobbyConfig() {
        return lobbyConfig;
    }
}
