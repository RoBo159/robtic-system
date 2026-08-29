package org.robtic.discord;

import org.bukkit.command.CommandExecutor;
import org.robtic.core.RobticCorePlugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.auth.AuthBridge;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.PlayerDataService;
import org.robtic.core.service.PriceService;
import org.robtic.core.service.RobticServices;
import org.robtic.core.staff.ModerationBridge;

import java.util.List;

/**
 * RobticDiscord: the Minecraft side of the Discord bridge.
 *
 * Account linking, chat relay, and draining the instructions Discord queues for this server.
 *
 * <h2>The bot is not here</h2>
 *
 * Worth stating because the name suggests otherwise. The Discord bot is a separate service written
 * in TypeScript and is not a Bukkit plugin; it could not be one. What this plugin does is the
 * server's half of the conversation: issue link codes, relay chat both ways, and act on what the bot
 * sends back.
 *
 * <h2>Where the last dependency cycle ended</h2>
 *
 * In the monolith, the bridge consumer called straight into the freeze, jail and staff-chat
 * services while those called back into the API layer the bridge lived in — the {@code service} ↔
 * {@code staff} cycle. Here it would have been RobticDiscord importing RobticStaff.
 *
 * Instead both moderation and authentication arrive through interfaces in Core
 * ({@link ModerationBridge}, {@link AuthBridge}), registered by whoever can act on them. This plugin
 * imports neither RobticStaff nor RobticAuth, and runs perfectly well with neither installed — it
 * simply ignores the instructions it cannot carry out.
 */
public final class RobticDiscordPlugin extends RobticPlugin {

    private ChatBridgeService chat;
    private BridgeConsumerService consumer;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.optional("RobticStaff",
                        "moderation actions taken from Discord cannot be applied on this server"),
                PluginDependency.optional("RobticAuth",
                        "account link and password events from Discord will be ignored"));
    }

    @Override
    protected void start() {
        RobticCorePlugin core = core();

        ApiGateway gateway = require(ApiGateway.class);
        MessageCatalog messages = core.config().messages();

        chat = new ChatBridgeService(gateway, core.config().api(), core.config().server(), messages);

        // Both passed as suppliers, resolved per event rather than here.
        //
        // RobticStaff and RobticAuth register these bridges as they enable, and there is no ordering
        // that guarantees both have done so by now — RobticAuth genuinely requires this plugin, so it
        // must be able to enable after it. Resolving at this point captured whatever happened to
        // exist and never looked again: on a server where RobticAuth started second, every account
        // link, password change and unlink arriving from Discord was silently dropped for the rest of
        // the session.
        consumer = new BridgeConsumerService(this,
                gateway.client(), gateway, core.config().api(),
                chat,
                require(PriceService.class),
                require(PlayerDataService.class),
                () -> RobticServices.findOr(ModerationBridge.class, ModerationBridge.NONE),
                () -> RobticServices.find(AuthBridge.class).orElse(null));

        getServer().getPluginManager().registerEvents(new PlayerChatListener(this, chat), this);

        LinkCommands commands = new LinkCommands(this, core.config().server(), messages,
                gateway, require(PlayerDataService.class));

        bind("link", commands);
        bind("unlink", commands);

        // The Discord → Minecraft direction. Without this timer the consumer is constructed and
        // never runs, and every instruction the bot queues — relayed chat, a jail release, an
        // account link — sits in the API unread.
        long poll = core.config().api().pollTicks();

        getServer().getScheduler().runTaskTimerAsynchronously(this, consumer::poll, poll, poll);

        // The API every other plugin uses to reach Discord. Registered last, so nothing can resolve
        // it before the bridge behind it is running.
        RobticServices.register(this, org.robtic.core.discord.DiscordService.class,
                new ApiDiscordService(this, gateway, core.config().api(),
                        require(PlayerDataService.class)));

        RobticServices.register(this, ChatBridgeService.class, chat);

        // No longer reports whether RobticAuth is present. It may well not have enabled yet — this
        // plugin now deliberately starts first — so anything said here about it would be a guess,
        // and the old line reported "no RobticAuth" on servers that had it.
        getLogger().info("RobticDiscord ready.");
    }

    private void bind(String name, CommandExecutor executor) {
        var command = getServer().getPluginCommand(name);

        if (command == null) {
            getLogger().warning("The command \"" + name + "\" is not declared in plugin.yml,"
                    + " so it will not work.");
            return;
        }

        command.setExecutor(executor);
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

    public ChatBridgeService chat() {
        return chat;
    }

    public BridgeConsumerService consumer() {
        return consumer;
    }
}
