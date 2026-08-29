package org.robtic.mail;

import org.bukkit.entity.Player;
import org.robtic.core.mail.MailboxService;

import java.util.UUID;

/**
 * What other plugins see of the mail system.
 *
 * Two methods, wrapping the service that fetches and the menu that renders. Everything else
 * {@link MailService} can do stays inside this plugin.
 *
 * <h2>Why an adapter rather than making MailService implement the interface</h2>
 *
 * Opening the mailbox is two objects' work: the service loads the messages and the menu draws them.
 * Making the service implement {@code open} would give it a reference to the menu purely to satisfy
 * a contract meant for outsiders, and would put a GUI dependency inside a class whose job is API
 * traffic. The adapter keeps that seam where it already was.
 */
public final class BukkitMailbox implements MailboxService {

    private final MailService mail;
    private final MailMenu menu;

    public BukkitMailbox(MailService mail, MailMenu menu) {
        this.mail = mail;
        this.menu = menu;
    }

    @Override
    public int unreadCount(UUID player) {
        return mail.unreadCount(player);
    }

    /**
     * Loads the player's mail, then opens the menu on it.
     *
     * The same path {@code /mail} takes, deliberately: a mailbox opened from another plugin's menu
     * must behave identically to one opened by the command, including how it handles an empty inbox
     * and an API that is unreachable.
     */
    @Override
    public void open(Player player) {
        mail.mailbox(player, mails -> menu.open(player, mails));
    }
}
