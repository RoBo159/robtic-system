package org.robtic.core.notify.channels;

import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.notify.Notification;
import org.robtic.core.notify.NotificationChannel;
import org.robtic.core.util.Chat;

/**
 * Delivers in-game, to a player who is online right now.
 *
 * <h2>Online-only, and that is not a gap</h2>
 *
 * A chat message to an offline player is not a message. This channel simply does nothing for one,
 * and the category's other channels — mail, Discord — are what reach them. That division is the
 * reason categories list several channels rather than one: each covers a case the others cannot, and
 * the operator decides which combination a system needs.
 *
 * <h2>Sound is priority, not decoration</h2>
 *
 * A player mid-fight does not read chat. An {@link Notification.Priority#URGENT} notification is the
 * last warning before something is lost, so it gets an audible cue; anything quieter does not,
 * because a server that pings for routine notices trains its players to ignore the ping.
 */
public final class ChatChannel implements NotificationChannel {

    public static final String ID = "chat";

    private final Plugin plugin;

    public ChatChannel(Plugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public void deliver(Notification notification) {
        Player player = plugin.getServer().getPlayer(notification.recipient());

        // Offline, or logged out between the sweep observing this and the dispatch. Ordinary, and
        // the whole reason a category lists more than one channel.
        if (player == null || !player.isOnline()) {
            return;
        }

        if (!notification.title().isBlank()) {
            player.sendMessage(Chat.component(notification.title()));
        }

        for (String line : notification.body()) {
            player.sendMessage(Chat.component(line));
        }

        if (notification.priority() == Notification.Priority.URGENT) {
            player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f, 0.7f);
        }
    }
}
