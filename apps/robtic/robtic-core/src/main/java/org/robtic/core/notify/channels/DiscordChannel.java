package org.robtic.core.notify.channels;

import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.Plugin;
import org.robtic.core.discord.DiscordEmbed;
import org.robtic.core.discord.DiscordService;
import org.robtic.core.notify.Notification;
import org.robtic.core.notify.NotificationChannel;
import org.robtic.core.notify.NotificationSettings;

import java.util.function.Supplier;

/**
 * Mirrors a notification to Discord.
 *
 * <h2>A channel post, not a direct message</h2>
 *
 * {@code DiscordService} can send to a channel and can tell whether an account is linked, but has no
 * way to open a DM — the bot lives on the other side of the API and that route does not exist. So
 * this posts an embed to the configured channel and mentions the linked user, which reaches them
 * through Discord's own notification settings.
 *
 * Adding a real DM later changes this class and nothing else: senders name a category, and the
 * category still routes to {@code discord}.
 *
 * <h2>Unlinked players are skipped, not posted about</h2>
 *
 * A notification is addressed to one player. Posting "your licence expires tomorrow" into a public
 * channel with no way to say whose licence it is would be noise at best and a privacy problem at
 * worst, so an unlinked account simply does not use this channel — and the category's chat and mail
 * channels still reach them.
 */
public final class DiscordChannel implements NotificationChannel {

    public static final String ID = "discord";

    /** Embed colours by priority, so an urgent notice is distinguishable at a glance. */
    private static final int COLOUR_INFO = 0x5865F2;
    private static final int COLOUR_IMPORTANT = 0xFEE75C;
    private static final int COLOUR_URGENT = 0xED4245;

    private final Plugin plugin;
    private final Supplier<DiscordService> discord;
    private final Supplier<NotificationSettings> settings;

    public DiscordChannel(
            Plugin plugin,
            Supplier<DiscordService> discord,
            Supplier<NotificationSettings> settings
    ) {
        this.plugin = plugin;
        this.discord = discord;
        this.settings = settings;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public boolean available() {
        return discord.get().available() && !settings.get().discordChannelId().isBlank();
    }

    @Override
    public void deliver(Notification notification) {
        DiscordService service = discord.get();
        String channelId = settings.get().discordChannelId();

        if (!service.available() || channelId.isBlank()) {
            return;
        }

        // The mention is what turns a channel post into something the player actually sees. Without
        // a link there is nobody to mention, and the post would be addressed to no one.
        String mention = service.discordIdOf(notification.recipient())
                .map(id -> "<@" + id + ">")
                .orElse("");

        if (mention.isEmpty()) {
            return;
        }

        OfflinePlayer recipient = plugin.getServer().getOfflinePlayer(notification.recipient());
        String username = recipient.getName() == null ? "Unknown" : recipient.getName();

        DiscordEmbed.Builder embed = DiscordEmbed.builder()
                .title(strip(notification.title()))
                .description(String.join("\n", notification.body().stream().map(DiscordChannel::strip).toList()))
                .colour(colourOf(notification.priority()))
                .footer(username)
                .now();

        // Context values are rendered as fields rather than dropped: a system that took the trouble
        // to attach "days remaining" or "base level" wants it visible, and Discord is the one channel
        // with somewhere structured to put it.
        notification.context().forEach((name, value) -> embed.field(name, value, true));

        service.sendMessage(channelId, mention);
        service.sendEmbed(channelId, embed.build());
    }

    private static int colourOf(Notification.Priority priority) {
        return switch (priority) {
            case URGENT -> COLOUR_URGENT;
            case IMPORTANT -> COLOUR_IMPORTANT;
            case INFO -> COLOUR_INFO;
        };
    }

    /** Discord has no notion of Minecraft colour codes, and would show them literally. */
    private static String strip(String text) {
        return text == null ? "" : text.replaceAll("[&§][0-9a-fk-orA-FK-OR]", "");
    }
}
