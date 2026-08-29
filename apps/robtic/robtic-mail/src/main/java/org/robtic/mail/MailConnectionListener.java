package org.robtic.mail;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.robtic.core.event.PlayerJoinStateEvent;

/**
 * Seeds a player's mailbox on join, and forgets them on quit.
 *
 * <h2>The unread count arrives with the join state</h2>
 *
 * It is not fetched separately. The join document Core publishes already carries it, so the mailbox
 * item on the profile menu is correct the instant a player can open it — rather than showing zero
 * until a request that started at the same moment happens to come back.
 */
public final class MailConnectionListener implements Listener {

    private final MailService mail;

    public MailConnectionListener(MailService mail) {
        this.mail = mail;
    }

    @EventHandler
    public void onJoinState(PlayerJoinStateEvent event) {
        Player player = event.getPlayer().orElse(null);

        if (player == null) {
            return;
        }

        mail.setUnread(event.getPlayerId(), (int) event.number("unreadMail"));

        // Announced after the count is seeded, so the notification and the badge cannot disagree.
        // Acknowledged in the same pass: the player has now been told, and telling them again on
        // their next join would make every message look new forever.
        mail.pending(player, waiting -> {
            if (waiting.isEmpty()) {
                return;
            }

            mail.announce(player, waiting);
            mail.acknowledge(player, waiting);
        });
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        mail.forget(event.getPlayer().getUniqueId());
    }
}
