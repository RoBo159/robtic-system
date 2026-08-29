package org.robtic.auth;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.RobticCorePlugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.auth.AuthBridge;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.RobticServices;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.logging.Level;

/**
 * RobticAuth: registration, login and Discord verification.
 *
 * <h2>Why RobticDiscord is required and not optional</h2>
 *
 * A player's identity is proven on Discord. Linking an account, setting a password and changing one
 * all happen there, and this plugin finds out through events the Discord bridge delivers. With no
 * bridge there is no way for anybody to ever become authenticated — every player would be held at a
 * login prompt they could not satisfy, which is worse than not running at all.
 *
 * So it is a required dependency, and {@link RobticPlugin} disables this plugin with one line if it
 * is missing rather than locking the server out.
 *
 * <h2>The events arrive through Core, not through an import</h2>
 *
 * {@link AuthService} implements Core's {@link AuthBridge} and registers it. RobticDiscord resolves
 * that interface and delivers what it receives. The dependency is therefore one-way in the build —
 * this plugin depends on Discord, Discord depends on nothing but Core — and the callback that would
 * otherwise close the loop travels through a contract neither owns.
 *
 * <h2>Login surfaces, best first</h2>
 *
 * A native client dialog for Java, and chat capture for everything else. The chat surface supports
 * everybody, so it is registered last and the router always reaches something — a player nothing
 * supports is a player who cannot log in.
 */
public final class RobticAuthPlugin extends RobticPlugin {

    private AuthService auth;
    private AuthSettings settings;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.required("RobticDiscord"));
    }

    @Override
    protected void start() {
        RobticCorePlugin core = core();

        settings = new AuthSettings(read("auth.yml"), getLogger());

        if (!settings.enabled()) {
            getLogger().info("RobticAuth is disabled in auth.yml.");
            return;
        }

        ApiGateway gateway = RobticServices.find(ApiGateway.class).orElseThrow(
                () -> new IllegalStateException("RobticCore did not register ApiGateway."));

        MessageCatalog messages = core.config().messages();

        auth = new AuthService(this, gateway.client(), gateway, core.config().api(), settings, messages);

        registerContainment(messages);
        registerPrompts(messages);

        AuthAdminCommands commands = new AuthAdminCommands(auth, messages);

        var command = getServer().getPluginCommand("auth");

        if (command == null) {
            getLogger().warning("The command \"auth\" is not declared in plugin.yml,"
                    + " so it will not work.");
        } else {
            command.setExecutor(commands);
            command.setTabCompleter(commands);
        }

        // How Discord tells this server that somebody linked, changed a password or unlinked.
        // Registered last, so nothing can arrive before the surfaces that would act on it exist.
        RobticServices.register(this, AuthBridge.class, auth);
        RobticServices.register(this, AuthService.class, auth);

        // Frees a slot held by a client that joined and was abandoned at the login prompt. Not a
        // security measure — an unauthenticated player can already do nothing — so it runs on a
        // relaxed interval rather than every tick.
        if (settings.timeoutSeconds() > 0) {
            getServer().getScheduler().runTaskTimer(this,
                    () -> kickIdleUnauthenticated(messages), 200L, 200L);
        }

        getLogger().info("RobticAuth enabled"
                + (settings.linkWorldName().isBlank()
                        ? " with no link world configured."
                        : " (link world \"" + settings.linkWorldName() + "\")."));
    }

    /** What an unauthenticated player may not do, and where they wait while they prove otherwise. */
    private void registerContainment(MessageCatalog messages) {
        AuthRestrictionListener restrictions = new AuthRestrictionListener(auth, messages);

        // Loaded before the listener is registered, so a player who was mid-login when the server
        // stopped still has their position when they come back. See AuthReturnStore.
        AuthReturnStore returns = new AuthReturnStore(
                getDataFolder().toPath().resolve("return-locations.json"), getLogger());

        returns.load();

        getServer().getPluginManager().registerEvents(restrictions, this);
        getServer().getPluginManager().registerEvents(
                new AuthPlacementListener(this, auth, restrictions, returns, messages), this);
    }

    /** Where a player is asked for their password. */
    private void registerPrompts(MessageCatalog messages) {
        AuthPlatform platform = new AuthPlatform(this);

        AuthChatPrompt chatPrompt = new AuthChatPrompt(this, auth, messages);
        AuthDialogPrompt dialogPrompt = new AuthDialogPrompt(this, auth, platform, messages);

        AuthPromptRouter router = new AuthPromptRouter(this)
                .register(dialogPrompt)
                .register(chatPrompt);

        auth.promptWith(router::show);
        auth.dismissWith(dialogPrompt::dismiss);

        // Every dialog is built once here, before anybody can connect. The Dialog API validates at
        // construction, and a screen that cannot be built shows a player nothing at all — no error,
        // no prompt, no way to log in. Finding that at boot rather than when somebody joins is the
        // difference between a console line and a locked-out player.
        if (platform.supportsDialogs() && !dialogPrompt.selfTest()) {
            getLogger().severe("One or more login dialogs failed to build (see above). Players who"
                    + " reach those screens will fall back to the chat prompt.");
        }

        // Registered before the restriction listener, which shares its priority: the capture has to
        // claim a password line before the "you must log in" refusal sees it.
        getServer().getPluginManager().registerEvents(new AuthChatListener(chatPrompt), this);

        // Asks for the password before the world loads, so an authenticated player never enters it
        // unauthenticated and none of the containment above ever applies to them. Registered only
        // when the server can actually render a dialog — on an older build there is nothing to show,
        // and holding the connection would lock everybody out.
        if (settings.preJoinLogin() && platform.supportsDialogs()) {
            getServer().getPluginManager().registerEvents(
                    new AuthConfigurationListener(this, auth, messages), this);

            getLogger().info("Pre-join login is on: players are asked for their password before"
                    + " entering the world.");
        }

        if (!platform.supportsDialogs()) {
            getLogger().warning("This server is older than Paper 1.21.7, so the Dialog API is"
                    + " unavailable and every player will log in through chat instead.");
        }
    }

    private void kickIdleUnauthenticated(MessageCatalog messages) {
        long timeoutMillis = auth.settings().timeoutSeconds() * 1000L;

        for (var player : getServer().getOnlinePlayers()) {
            if (auth.isAuthenticated(player.getUniqueId())) {
                continue;
            }

            auth.stateOf(player.getUniqueId())
                    .filter(state -> state.pendingMillis() >= timeoutMillis)
                    .ifPresent(state -> player.kick(
                            MessageCatalog.render(messages.text("auth.kicked-timeout"))));
        }
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

    public AuthService auth() {
        return auth;
    }
}
