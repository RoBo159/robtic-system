package org.robtic.market;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.RobticCorePlugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.ServerSettings;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.PriceService;
import org.robtic.core.service.RobsService;
import org.robtic.core.service.RobticServices;

import java.util.List;

/**
 * RobticMarket: the ore exchange, and the marketplace it will grow into.
 *
 * <h2>What is here today</h2>
 *
 * The exchange: a menu of what the server buys, at prices the API sets, paid in robs. That is the
 * whole plugin — four classes and one command.
 *
 * <h2>What it is for</h2>
 *
 * Player listings, offers and buying are the stated destination. They belong beside the exchange
 * because both are "a player converts items into robs and back", and both need the same three things
 * from Core: the price list, the economy, and player identity. Splitting them later would mean two
 * plugins holding two views of what a stack of diamonds is worth.
 *
 * <h2>Prices and payment are Core's</h2>
 *
 * {@link PriceService} and {@link RobsService} are resolved, never constructed. A second price cache
 * here would drift from the one the placeholders read, and a second economy client would mean two
 * halves of the server's payments that neither knows about.
 */
public final class RobticMarketPlugin extends RobticPlugin {

    private ExchangeController exchange;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(PluginDependency.required("RobticCore"));
    }

    @Override
    protected void start() {
        RobticCorePlugin core = core();

        ServerSettings server = core.config().server();
        MessageCatalog messages = core.config().messages();

        ExchangeMenu menu = new ExchangeMenu(server.exchangeTitle(), server.exchangeRows());

        exchange = new ExchangeController(this, server, messages, menu,
                require(PriceService.class),
                require(PlayerDataService.class),
                require(RobsService.class));

        getServer().getPluginManager().registerEvents(
                new ExchangeMenuListener(exchange, server.exchangeRows()), this);

        ExchangeCommand command = new ExchangeCommand(exchange, messages);

        var exchangeCommand = getServer().getPluginCommand("exchange");

        if (exchangeCommand == null) {
            getLogger().warning("The command \"exchange\" is not declared in plugin.yml,"
                    + " so the exchange cannot be opened.");
        } else {
            exchangeCommand.setExecutor(command);
        }

        registerNpcs(server);

        RobticServices.register(this, ExchangeController.class, exchange);

        startDiscord();

        getLogger().info("RobticMarket ready.");
    }

    /**
     * Exchange NPCs: right-clicking one opens the menu.
     *
     * Two mechanisms, because there are two ways a click arrives. Entity-backed NPCs — Citizens, or a
     * plain armour stand — fire {@code PlayerInteractEntityEvent} and are caught by the listener.
     * Citizens also raises its own {@code NPCRightClickEvent}, which {@link NpcHooks} reaches by
     * reflection because Citizens is not a build dependency of this module.
     *
     * Both are skipped entirely when no NPC names are configured, so a server that does not use
     * exchange NPCs registers neither.
     */
    private void registerNpcs(ServerSettings server) {
        if (!server.npcEnabled() || server.npcNames().isEmpty()) {
            return;
        }

        getServer().getPluginManager().registerEvents(
                new NpcInteractListener(exchange, server.npcNames()), this);

        NpcHooks.register(this, exchange, server.npcNames());
    }

    /**
     * {@code /exchange} — opens the ore exchange.
     *
     * Its own executor rather than a verb on a larger command, because in the monolith it hung off
     * the same class as {@code /link} and {@code /robs} and those three now live in three plugins.
     * The permission is unchanged: {@code robtic.robs}, because the exchange pays in robs and a
     * player who cannot hold robs has nothing to do here.
     */
    private record ExchangeCommand(ExchangeController exchange, MessageCatalog messages)
            implements CommandExecutor {

        @Override
        public boolean onCommand(
                @NotNull CommandSender sender,
                @NotNull Command command,
                @NotNull String label,
                @NotNull String[] args
        ) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("That command can only be run by a player.");
                return true;
            }

            if (!player.hasPermission("robtic.robs")) {
                player.sendMessage(messages.prefixed("robs.locked"));
                return true;
            }

            exchange.openMain(player);
            return true;
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

    /** Never null: resolves to a do-nothing integration when Discord is off or absent. */
    private org.robtic.core.discord.DiscordIntegration discord;

    /**
     * This plugin's optional Discord integration.
     *
     * Off by default. The exchange works identically without RobticDiscord — this only mirrors sales
     * into a channel, and no payment depends on it.
     */
    private void startDiscord() {
        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        read("market.yml").getConfigurationSection("discord"),
                        "market.yml", getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        RobticServices.register(this, org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "market";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return routes();
                    }
                });
    }

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> routes() {
        var section = read("market.yml").getConfigurationSection("discord.log-actions");

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

    /** Reads this plugin's own file, restoring it if deleted and merging in keys an update added. */
    private org.bukkit.configuration.file.FileConfiguration read(String name) {
        java.io.File file = new java.io.File(getDataFolder(), name);

        if (!file.exists()) {
            saveResource(name, false);
        }

        var configuration = org.bukkit.configuration.file.YamlConfiguration.loadConfiguration(file);

        try (var stream = getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(
                        org.bukkit.configuration.file.YamlConfiguration.loadConfiguration(
                                new java.io.InputStreamReader(
                                        stream, java.nio.charset.StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            getLogger().log(java.util.logging.Level.WARNING,
                    "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    public ExchangeController exchange() {
        return exchange;
    }
}
