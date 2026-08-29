package org.robtic.mail;

import org.robtic.core.RobticCorePlugin;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.RobticServices;

import java.util.List;

/**
 * RobticMail: the player mailbox, its attachments and its notifications.
 *
 * <h2>Nothing is stored here</h2>
 *
 * The API holds the mail, because nearly every message it carries is generated while the recipient
 * is offline — a report resolved, a purchase delivered, a licence about to lapse. A local store
 * would be a cache of something this server is not the authority for, and would have to be
 * reconciled on every join.
 *
 * That is also why this plugin has no configuration file of its own: everything it needs is the API
 * settings and the message catalogue, both of which are Core's.
 *
 * <h2>Small, and deliberately so</h2>
 *
 * Six classes and one command. It is a separate plugin rather than a corner of Core because mail is
 * a feature, not infrastructure — a server that does not want a mailbox removes the jar, and nothing
 * else notices.
 */
public final class RobticMailPlugin extends RobticPlugin {

    private MailService mail;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(PluginDependency.required("RobticCore"));
    }

    @Override
    protected void start() {
        ApiGateway gateway = RobticServices.find(ApiGateway.class).orElseThrow(
                () -> new IllegalStateException("RobticCore did not register ApiGateway."));

        MessageCatalog messages = core().config().messages();

        mail = new MailService(this, gateway, core().config().api(), messages);

        MailMenu menu = new MailMenu(messages);

        getServer().getPluginManager().registerEvents(new MailMenuListener(this, mail, menu), this);
        getServer().getPluginManager().registerEvents(new MailConnectionListener(mail), this);

        MailCommand command = new MailCommand(mail, menu);

        var mailCommand = getServer().getPluginCommand("mail");

        if (mailCommand == null) {
            getLogger().warning("The command \"mail\" is not declared in plugin.yml,"
                    + " so the mailbox cannot be opened.");
        } else {
            // No tab completer: /mail takes no arguments — see its usage in plugin.yml.
            mailCommand.setExecutor(command);
        }

        // The contract outsiders use. RobticEssentials shows an unread count on the profile menu and
        // opens the mailbox when it is clicked; it resolves this rather than compiling against this
        // plugin, so a server without RobticMail simply has no mail button.
        RobticServices.register(this, org.robtic.core.mail.MailboxService.class,
                new BukkitMailbox(mail, menu));

        // The sending half of the same idea. Core's notification system routes its `mail` channel
        // through this, so a licence warning reaches a player who is offline — which chat cannot do
        // and which is the entire reason that channel exists.
        RobticServices.register(this, org.robtic.core.mail.MailSender.class,
                new ApiMailSender(mail, gateway));

        // The full service, for anything inside this plugin and for a future sender that genuinely
        // needs more than the two-method contract above.
        RobticServices.register(this, MailService.class, mail);

        startDiscord();

        getLogger().info("RobticMail ready.");
    }

    /**
     * Core's configuration.
     *
     * Reached through the plugin rather than the service registry because {@code CoreConfig} is a
     * registry of settings objects rather than a service with a contract — registering it would
     * publish an implementation, which is the thing the service rules exist to prevent.
     */
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
     * Off by default. Mail works identically without RobticDiscord — this only mirrors activity into
     * a channel, and the mailbox itself never depends on it.
     */
    private void startDiscord() {
        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        read("mail.yml").getConfigurationSection("discord"), "mail.yml", getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        RobticServices.register(this, org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "mail";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return routes();
                    }
                });
    }

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> routes() {
        var section = read("mail.yml").getConfigurationSection("discord.log-actions");

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

    /** Reads this plugin's own file, restoring it if deleted and merging in keys a update added. */
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

    /** The mail service, for anything inside this plugin. */
    public MailService mail() {
        return mail;
    }
}
