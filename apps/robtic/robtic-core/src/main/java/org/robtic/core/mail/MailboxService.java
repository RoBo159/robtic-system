package org.robtic.core.mail;

import org.bukkit.entity.Player;

import java.util.UUID;

/**
 * Somewhere a player's mail can be read.
 *
 * <h2>Why the contract is here and the mailbox is not</h2>
 *
 * RobticEssentials shows an unread count on the profile menu and opens the mailbox when it is
 * clicked. That is the entire dependency — two calls — and satisfying it by having Essentials
 * compile against RobticMail would put a feature plugin on another feature plugin's critical path
 * for the sake of one button.
 *
 * So the two calls are an interface in Core. RobticMail registers an implementation; Essentials asks
 * for one and hides the button when there is none. A server that does not install RobticMail loses
 * the mail button and nothing else, and neither plugin knows the other exists.
 *
 * <h2>Deliberately not the whole mail API</h2>
 *
 * {@code MailService} can compose, send, claim attachments and expire messages. None of that belongs
 * here: this interface is exactly what a <em>consumer</em> outside the mail system needs, which
 * keeps future callers — a completed contract, a marketplace sale, a moderation outcome — from
 * growing a dependency on mail's internals. A sender's contract, when something needs one, is a
 * second small interface rather than an extension of this one.
 */
public interface MailboxService {

    /**
     * How many unread messages a player has.
     *
     * Answered from whatever the implementation already knows rather than by asking the API, because
     * this is called while rendering a menu. An implementation with nothing cached returns zero
     * rather than blocking the main thread.
     */
    int unreadCount(UUID player);

    /**
     * Opens the mailbox.
     *
     * Asynchronous by nature — the messages come from the API — so this returns immediately and the
     * inventory appears when the fetch completes. A caller must not assume a menu is open when this
     * returns.
     */
    void open(Player player);
}
