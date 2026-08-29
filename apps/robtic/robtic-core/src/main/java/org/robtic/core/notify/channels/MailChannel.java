package org.robtic.core.notify.channels;

import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.Plugin;
import org.robtic.core.mail.MailSender;
import org.robtic.core.notify.Notification;
import org.robtic.core.notify.NotificationChannel;
import org.robtic.core.notify.NotificationSettings;

import java.util.function.Supplier;

/**
 * Delivers as mail, so an offline player still finds out.
 *
 * <h2>This is the channel that makes a warning trustworthy</h2>
 *
 * Everything else in the system is best-effort: chat needs the player online, Discord needs them
 * linked. Mail is stored by the API and handed over the next time they join, which is the only
 * channel that can honestly claim a player who logs in again will see it. For anything with a
 * consequence attached — a licence lapsing, a business about to be lost — that is the difference
 * between a warning and a formality.
 *
 * <h2>Colour codes are stripped</h2>
 *
 * A letter is rendered into a written book, and the API stores plain strings with a length limit.
 * Legacy {@code &} codes that survived into the body would be shown literally, so they are removed
 * here rather than in every sender — a notification is written once and delivered to channels that
 * disagree about markup.
 */
public final class MailChannel implements NotificationChannel {

    public static final String ID = "mail";

    /** The API caps a subject at 64 characters and a body line at 256. Trimmed rather than rejected. */
    private static final int MAX_SUBJECT = 64;
    private static final int MAX_LINE = 256;

    private final Plugin plugin;
    private final Supplier<MailSender> sender;
    private final Supplier<NotificationSettings> settings;

    public MailChannel(Plugin plugin, Supplier<MailSender> sender, Supplier<NotificationSettings> settings) {
        this.plugin = plugin;
        this.sender = sender;
        this.settings = settings;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public boolean available() {
        return sender.get().available();
    }

    @Override
    public void deliver(Notification notification) {
        MailSender mail = sender.get();

        if (!mail.available()) {
            return;
        }

        OfflinePlayer recipient = plugin.getServer().getOfflinePlayer(notification.recipient());
        String username = recipient.getName() == null ? "" : recipient.getName();

        String subject = notification.title().isBlank()
                ? "Notification"
                : truncate(strip(notification.title()), MAX_SUBJECT);

        mail.send(new MailSender.Letter(
                notification.recipient(),
                username,
                settings.get().mailCategory(),
                subject,
                notification.body().stream()
                        .map(MailChannel::strip)
                        .map(line -> truncate(line, MAX_LINE))
                        .toList(),
                "",
                // Anything above routine is announced on join rather than waiting to be opened. A
                // player who is about to lose a business should not have to check their mail to
                // discover it.
                notification.priority().atLeast(Notification.Priority.IMPORTANT),
                // The notification's own id, which is already unique per thing-and-threshold. That
                // makes the API's idempotency work for free: a duplicate post is recognised rather
                // than producing a second letter.
                notification.id()));
    }

    /**
     * Removes legacy colour codes.
     *
     * Handles both {@code &} and the section sign, because a message that has already been through a
     * catalog may carry either, and a letter showing "&e" to a player is worse than a plain one.
     */
    private static String strip(String text) {
        return text == null ? "" : text.replaceAll("[&§][0-9a-fk-orA-FK-OR]", "");
    }

    private static String truncate(String text, int limit) {
        return text.length() <= limit ? text : text.substring(0, limit);
    }
}
