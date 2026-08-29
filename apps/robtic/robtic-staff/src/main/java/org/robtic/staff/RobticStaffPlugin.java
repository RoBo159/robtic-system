package org.robtic.staff;

import org.bukkit.command.CommandExecutor;
import org.bukkit.command.TabCompleter;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.RoleSettings;
import org.robtic.core.config.ServerSettings;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.PermissionSyncService;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.RobticServices;
import org.robtic.core.service.RoleSyncService;
import org.robtic.staff.command.StaffCommands;
import org.robtic.staff.config.ItemCatalog;
import org.robtic.staff.config.LobbySettings;
import org.robtic.staff.config.StaffSettings;
import org.robtic.staff.gui.StaffMenuFactory;
import org.robtic.staff.listener.StaffMenuListener;
import org.robtic.staff.listener.StaffToolListener;
import org.robtic.staff.service.StaffLogService;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.logging.Level;

/**
 * RobticStaff: everything to do with running the server.
 *
 * Moderation, freeze, vanish, inspection, staff chat, logs, admin tools and reports. Essential, and
 * deliberately self-contained — nothing here belongs anywhere else, and nothing else belongs here.
 *
 * <h2>Two of the monolith's four dependency cycles ended here</h2>
 *
 * {@code gui} ↔ {@code staff} and {@code service} ↔ {@code staff} were both cycles because the staff
 * menu, the action dispatcher and the staff log were in three different packages that each reached
 * into the others. All three are in this plugin now, so the cycles are not broken so much as
 * dissolved: there is no boundary left for them to cross.
 *
 * <h2>What comes from Core, and how</h2>
 *
 * The API gateway, player data, permission sync and role sync are Core's. This plugin resolves them
 * from the service registry at enable and never constructs one — which is what stops a second copy
 * of the API client, a second offline queue and a second set of caches appearing on the same server.
 *
 * Resolving once at enable is safe here because RobticCore is a required dependency:
 * {@link RobticPlugin} has already refused to start this plugin if Core is not up.
 */
public final class RobticStaffPlugin extends RobticPlugin {


    private StaffSettings staffSettings;
    private ItemCatalog items;
    private LobbySettings lobbies;

    private StaffModeService staffMode;
    private StaffChatService staffChat;
    private VanishService vanish;
    private FreezeService freeze;
    private JailService jail;
    private ReportService reports;
    private StaffAvailabilityService availability;
    private StaffStatsCache stats;

    /** Never null: resolves to a do-nothing integration when Discord is off or absent. */
    private org.robtic.core.discord.DiscordIntegration discord;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.optional("LuckPerms",
                        "staff ranks cannot be applied as permission groups, so staff mode will not"
                                + " change anybody's permissions"));
    }

    @Override
    protected void start() {
        loadConfigs();

        // ─── From Core ────────────────────────────────────────────────────────────────────────
        //
        // Resolved, never constructed. A second ApiGateway here would mean a second offline queue
        // writing to a second file, and two halves of the server's outbound traffic that neither
        // knows about the other.
        ApiGateway gateway = require(ApiGateway.class);
        PlayerDataService players = require(PlayerDataService.class);
        PermissionSyncService permissions = require(PermissionSyncService.class);
        RoleSyncService roleSync = require(RoleSyncService.class);

        org.robtic.core.config.CoreConfig core = coreConfig();

        ApiSettings api = core.api();
        ServerSettings server = core.server();
        MessageCatalog messages = core.messages();
        RoleSettings roles = core.roles();

        // ─── Staff services ───────────────────────────────────────────────────────────────────
        StaffLogService staffLog = new StaffLogService(gateway, api, core.logging(), getLogger());
        staffChat = new StaffChatService(gateway, api, server, messages);

        vanish = new VanishService(this, staffSettings, messages);

        StaffToolService tools = new StaffToolService(items, messages);

        freeze = new FreezeService(this, gateway, api, staffSettings, messages, staffChat, staffLog);
        jail = new JailService(this, gateway, api, server, staffSettings, messages, staffChat, staffLog);

        staffMode = new StaffModeService(this, gateway.client(), gateway, api, server, roles, messages,
                permissions, tools, staffChat, staffLog);

        // Wired after construction: staff chat and vanish both need to ask "is this player in staff
        // mode?", and the mode service needs both of them to already exist.
        staffChat.bindStaffModeCheck(staffMode::isInStaffMode);
        vanish.bindStaffModeCheck(staffMode::isInStaffMode);

        // ─── Reports ──────────────────────────────────────────────────────────────────────────
        availability = new StaffAvailabilityService(staffMode, permissions, roles);
        stats = new StaffStatsCache(this, gateway.client(), api);

        LastSeenLocations lastSeen = new LastSeenLocations();
        ReportChatService reportChat = new ReportChatService(messages);

        reports = new ReportService(this, gateway, api, staffSettings, messages,
                availability, reportChat, jail, lastSeen);

        getServer().getPluginManager().registerEvents(new ReportChatListener(this, reportChat), this);

        // ─── Menus ────────────────────────────────────────────────────────────────────────────
        StaffMenuFactory menus = new StaffMenuFactory(
                messages, staffSettings, lobbies, freeze, jail, vanish, staffMode);

        StaffActionDispatcher dispatcher = new StaffActionDispatcher(
                messages, menus, freeze, vanish, staffMode, staffLog);

        // Bound after the fact: the reports action needs a service that needs the jail, which needs
        // the staff chat built before these menus.
        dispatcher.bindReports(reports);

        getServer().getPluginManager().registerEvents(new StaffMenuListener(
                menus, dispatcher, freeze, jail, lobbies, messages, staffLog, reports), this);
        getServer().getPluginManager().registerEvents(
                new StaffToolListener(tools, dispatcher, staffMode), this);

        // What a frozen or jailed player may not do: move, teleport, run commands, drop items,
        // interact, ride, break or place. It lived in a general listener package in the monolith;
        // every rule it enforces belongs to a service this plugin owns, so it lives here now.
        getServer().getPluginManager().registerEvents(
                new org.robtic.staff.listener.RestrictionListener(
                        freeze, jail, staffSettings, messages), this);

        getServer().getPluginManager().registerEvents(new org.robtic.staff.listener.StaffConnectionListener(
                messages, staffMode, staffChat, tools, vanish, freeze, jail, lastSeen), this);

        registerCommands(api, server, messages, gateway, roles, players, staffChat, menus,
                permissions, roleSync);

        // Contributed to Core's single expansion — PlaceholderAPI allows one per identifier, so this
        // plugin never registers one of its own.
        RobticServices.find(org.robtic.core.placeholder.RobticPlaceholders.class).ifPresent(
                expansion -> expansion.extend(new StaffPlaceholders(availability, stats)));

        startDiscord();

        // Report counters for the staff placeholders. One request per interval, never per tick.
        stats.start(availability);

        publish();

        getLogger().info("RobticStaff ready.");
    }

    /**
     * Binds every staff command.
     *
     * All of them keep the names, aliases and permissions they had in the monolith. A staff member's
     * muscle memory is not something a refactor gets to change.
     */
    private void registerCommands(
            ApiSettings api,
            ServerSettings server,
            MessageCatalog messages,
            ApiGateway gateway,
            RoleSettings roles,
            PlayerDataService players,
            StaffChatService staffChat,
            StaffMenuFactory menus,
            PermissionSyncService permissions,
            RoleSyncService roleSync
    ) {
        StaffCommands staff = new StaffCommands(this, api, server, messages, gateway, roles, players,
                staffMode, staffChat, freeze, jail, vanish, menus, permissions, roleSync, reports);

        // Every name the monolith bound, including the three hyphenated internal verbs — dropping
        // those would silently remove /jail set, the admin gate and jail history.
        for (String name : List.of(
                "admin", "a", "hide", "staff", "freeze", "jail", "unjail",
                "jail-set", "set-admin-gate", "jail-history", "warn", "warnings",
                "note", "notes", "report")) {
            bind(name, staff, staff);
        }

        FlightCommand flight = new FlightCommand(messages);
        bind("fly", flight, flight);

        // The roster commands read their ladder from RoleSettings, so nothing here names a rank.
        //
        // /players is deliberately absent: it is a lobby command (LobbyCommands#togglePlayers) and
        // belongs to RobticEssentials, despite sitting near these in the monolith.
        StaffRosterCommands roster = new StaffRosterCommands(
                gateway, api, messages, roles, permissions, players, roleSync, availability);

        for (String name : List.of("addstaff", "promotestaff", "demotestaff",
                "setstaffrole", "firestaff")) {
            bind(name, roster, roster);
        }
    }

    /**
     * This plugin's optional Discord integration.
     *
     * <h2>Optional in the strongest sense</h2>
     *
     * Every moderation action already logs in game and to the API. Discord adds a copy in a channel,
     * and nothing else in this plugin asks whether it worked. With {@code discord.enabled: false} —
     * the shipped default — none of this runs and nothing is logged about it.
     *
     * <h2>The log routes are this plugin's, not Core's</h2>
     *
     * jail, warning_added, player_report and the rest are moderation actions, so their channel
     * routing lives in staff.yml and is contributed to the configuration document Core pushes. A
     * server without RobticStaff contributes none of them, which is correct: it has no jails.
     */
    private void startDiscord() {
        // Copies the 3.x central config into this plugin's own file, once, without touching the
        // original. Silent on a fresh install.
        new org.robtic.core.discord.DiscordMigration(this,
                new java.io.File(getDataFolder().getParentFile(), "RobticMinecraft"))
                .migrate(new java.io.File(getDataFolder(), "staff.yml"),
                        org.robtic.core.discord.DiscordMigration.channels(
                                "discord.log-channel", "logs",
                                "discord.staff-channel", "staff"),
                        LOG_ACTIONS);

        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        read("staff.yml").getConfigurationSection("discord"), "staff.yml", getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        // Contributed whether or not Discord is active here: the routes describe where this server
        // wants its logs, and the API keeps them for the bot regardless of whether this plugin is
        // currently sending anything.
        RobticServices.register(this, org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "staff";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return logRoutes();
                    }
                });
    }

    /** Action IDs this plugin owns. Everything moderation does; nothing another plugin does. */
    private static final java.util.List<String> LOG_ACTIONS = java.util.List.of(
            "freeze", "unfreeze", "jail", "release", "warning_added", "warning_removed",
            "note_added", "staff_enabled", "staff_disabled", "player_report");

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> logRoutes() {
        var section = read("staff.yml").getConfigurationSection("discord.log-actions");

        if (section == null) {
            return java.util.Map.of();
        }

        java.util.Map<String, String> routes = new java.util.LinkedHashMap<>();

        for (String action : section.getKeys(false)) {
            String channel = section.getString(action, "");

            if (channel != null && !channel.isBlank()) {
                routes.put(action, channel.trim());
            }
        }

        return routes;
    }

    /**
     * Publishes the services other plugins ask for.
     *
     * RobticDiscord's bridge needs to freeze, jail and relay staff chat on behalf of a moderator
     * acting from Discord. It resolves these rather than importing this plugin, which is what keeps
     * Discord from depending on Staff — the {@code service} ↔ {@code staff} cycle in a new costume,
     * had it been done the obvious way.
     */
    private void publish() {
        // What a moderator acting from Discord can do here. RobticDiscord resolves this rather
        // than importing this plugin — the last of the monolith's four dependency cycles.
        RobticServices.register(this, org.robtic.core.staff.ModerationBridge.class,
                new org.robtic.core.staff.ModerationBridge() {

                    @Override
                    public void showStaffChatFromDiscord(String username, String message) {
                        staffChat.showFromDiscord(username, message);
                    }

                    @Override
                    public void applyJailState(java.util.UUID player, boolean jailed, String reason) {
                        jail.applyRemoteState(player, jailed, reason);
                    }

                    @Override
                    public void applyFreezeState(java.util.UUID player, boolean frozen, String reason) {
                        freeze.applyRemoteState(player, frozen, reason);
                    }
                });

        // The cross-cutting question other plugins ask: is this player on duty right now? The AFK
        // timer exempts them, visibility treats them differently. Neither may depend on this plugin.
        RobticServices.register(this, org.robtic.core.staff.StaffPresence.class,
                staffMode::isInStaffMode);

        RobticServices.register(this, FreezeService.class, freeze);
        RobticServices.register(this, JailService.class, jail);
        RobticServices.register(this, VanishService.class, vanish);
        RobticServices.register(this, StaffModeService.class, staffMode);
        RobticServices.register(this, ReportService.class, reports);
        RobticServices.register(this, StaffAvailabilityService.class, availability);
        RobticServices.register(this, StaffStatsCache.class, stats);
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private void bind(String name, CommandExecutor executor, TabCompleter completer) {
        var command = getServer().getPluginCommand(name);

        if (command == null) {
            // A warning rather than a throw: one missing entry in plugin.yml should cost one
            // command, not the whole staff toolkit.
            getLogger().warning("The command \"" + name + "\" is not declared in plugin.yml,"
                    + " so it will not work.");
            return;
        }

        command.setExecutor(executor);
        command.setTabCompleter(completer);
    }

    /**
     * A Core service that must be there.
     *
     * Cannot legitimately fail: RobticCore is a required dependency, so {@link RobticPlugin} has
     * already refused to start this plugin if Core is missing or disabled. If it somehow does, the
     * exception is caught by {@code RobticPlugin#onEnable} and disables only this plugin.
     */
    private <T> T require(Class<T> contract) {
        return RobticServices.find(contract).orElseThrow(() -> new IllegalStateException(
                "RobticCore did not register " + contract.getSimpleName()
                        + ". RobticStaff cannot start without it."));
    }

    private org.robtic.core.config.CoreConfig coreConfig() {
        var core = getServer().getPluginManager().getPlugin("RobticCore");

        if (core instanceof org.robtic.core.RobticCorePlugin plugin) {
            return plugin.config();
        }

        throw new IllegalStateException("RobticCore is not the plugin this was compiled against.");
    }

    private void loadConfigs() {
        this.staffSettings = new StaffSettings(read("staff.yml"));
        this.items = new ItemCatalog(read("items.yml"), getLogger());
        this.lobbies = new LobbySettings(read("lobbies.yml"));
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

    /** Re-reads this plugin's own files. */
    public void reloadAll() {
        loadConfigs();
    }

}
