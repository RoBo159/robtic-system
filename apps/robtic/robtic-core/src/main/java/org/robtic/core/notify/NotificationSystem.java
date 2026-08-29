package org.robtic.core.notify;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.Plugin;
import org.robtic.core.discord.DiscordService;
import org.robtic.core.mail.MailSender;
import org.robtic.core.module.RobticModule;
import org.robtic.core.notify.channels.ChatChannel;
import org.robtic.core.notify.channels.DiscordChannel;
import org.robtic.core.notify.channels.MailChannel;
import org.robtic.core.service.RobticServices;

import java.util.function.Supplier;

/**
 * Builds and owns the notification system.
 *
 * <h2>The composition root for one module</h2>
 *
 * Constructor injection throughout, like every other Core module: nothing here looks itself up, and
 * the dependency direction fits on one screen. Moving this into its own plugin later is a package
 * move rather than a boot-sequence rewrite.
 *
 * <h2>Optional collaborators are resolved per call, deliberately</h2>
 *
 * {@code DiscordService} and {@code MailSender} are provided by plugins that may enable after Core,
 * be reloaded, or not be installed at all. Resolving them once at enable would capture whatever was
 * true at that instant — usually nothing — and a server would have to restart Core to make mail
 * start working.
 *
 * The usual objection is cost: {@link RobticServices#findOr} is a synchronised map lookup, and this
 * ecosystem's own guidance is to resolve once and hold. That guidance is about hot paths. A
 * notification is sent a handful of times per player per day, not per tick, so the lookup is free at
 * this frequency and buys correctness that caching would spend.
 *
 * <h2>Channels are registered, not hard-coded</h2>
 *
 * The three built-ins go in here because Core owns them. Anything else — a toast, a webhook, a
 * server owner's replacement for one of these — registers through {@link NotificationService}, and
 * the shipped ones have no privileged status beyond being registered first.
 */
public final class NotificationSystem implements RobticModule {

    private final Plugin plugin;
    private final Supplier<FileConfiguration> config;

    private final NotificationDispatcher dispatcher;

    private volatile NotificationSettings settings;

    public NotificationSystem(Plugin plugin, Supplier<FileConfiguration> config) {
        this.plugin = plugin;
        this.config = config;

        this.settings = new NotificationSettings(
                config.get().getConfigurationSection("notifications"), plugin.getLogger());

        this.dispatcher = new NotificationDispatcher(plugin, settings);
    }

    /** The API every other system uses. The only thing outside this package anybody should hold. */
    public NotificationService service() {
        return dispatcher;
    }

    /**
     * The dispatcher itself, for the one caller that needs more than the interface.
     *
     * {@link NotificationDispatcher#forget} and {@code forgetPrefix} are not on
     * {@link NotificationService} because they are a detail of how deduplication works rather than
     * part of "tell this player something" — but a system whose thresholds can legitimately fire
     * again, such as a licence renewed and left to lapse a second time, genuinely needs them.
     */
    public NotificationDispatcher dispatcher() {
        return dispatcher;
    }

    public NotificationSettings settings() {
        return settings;
    }

    @Override
    public String name() {
        return "notifications";
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────────────────────

    @Override
    public void enable() {
        if (!settings.enabled()) {
            plugin.getLogger().info("Notifications are disabled in notifications.yml. Every send is a"
                    + " no-op; nothing else is affected.");
            return;
        }

        registerBuiltins();

        plugin.getLogger().fine("Notifications started with the channels: "
                + String.join(", ", dispatcher.registered()) + ".");
    }

    private void registerBuiltins() {
        dispatcher.register(new ChatChannel(plugin));

        dispatcher.register(new MailChannel(
                plugin,
                () -> RobticServices.findOr(MailSender.class, MailSender.NONE),
                () -> settings));

        dispatcher.register(new DiscordChannel(
                plugin,
                () -> RobticServices.findOr(DiscordService.class, DiscordService.NONE),
                () -> settings));
    }

    @Override
    public void reload() {
        NotificationSettings replacement = new NotificationSettings(
                config.get().getConfigurationSection("notifications"), plugin.getLogger());

        this.settings = replacement;
        dispatcher.settings(replacement);

        // Registered again rather than only on first enable, so switching the system on in config and
        // reloading works without a restart. Registration replaces by id, so this cannot duplicate.
        if (replacement.enabled()) {
            registerBuiltins();
        }
    }

    @Override
    public void disable() {
        dispatcher.clear();
    }
}
