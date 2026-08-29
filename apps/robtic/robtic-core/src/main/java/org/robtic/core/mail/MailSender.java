package org.robtic.core.mail;

import java.util.List;
import java.util.UUID;

/**
 * How something outside the mail system posts a letter.
 *
 * <h2>Deliberately separate from {@link MailboxService}</h2>
 *
 * That interface is what a <em>reader</em> needs — an unread count and a way to open the mailbox —
 * and its own documentation says a sender's contract should be a second small interface rather than
 * an extension of it. This is that interface. A menu that shows an unread badge has no business
 * being able to send mail, and a system that sends mail has no business opening menus.
 *
 * <h2>Delivery is not immediate and is not confirmed</h2>
 *
 * Mail is stored by the Robtic API and handed to the player the next time they join. Nothing here
 * returns a result, for the same reason {@code DiscordService} does not: the write crosses a network
 * and completes long after the call. A caller that needs certainty is asking a question this seam
 * cannot answer.
 *
 * <h2>Absent means silent</h2>
 *
 * A server without RobticMail resolves {@link #NONE}. Sending succeeds and does nothing, so a
 * notification channel does not need a branch around every call.
 */
public interface MailSender {

    /**
     * One letter waiting to be posted.
     *
     * A record rather than seven parameters, because the optional half — sender name, importance, a
     * reference id — is genuinely optional and a positional call would be unreadable at every site.
     *
     * @param recipient   who receives it
     * @param username    their name at the time of sending, which the API stores so a letter to
     *                    somebody who never joins again is still attributable
     * @param category    the API's own mail category. Unknown values render as a plain book rather
     *                    than failing, so a newer category is safe to send to an older client
     * @param subject     one short line, shown in the mail list
     * @param body        the letter itself, one entry per line; see {@code Mail} for why it is a list
     * @param senderName  shown as the author. Blank means the server
     * @param important   whether it is announced on join rather than waiting to be opened
     * @param referenceId links the letter back to whatever produced it, for support and for
     *                    idempotency. Blank for none
     */
    record Letter(
            UUID recipient,
            String username,
            String category,
            String subject,
            List<String> body,
            String senderName,
            boolean important,
            String referenceId
    ) {

        public Letter {
            category = category == null || category.isBlank() ? "system" : category;
            subject = subject == null ? "" : subject;
            body = List.copyOf(body == null ? List.of() : body);
            senderName = senderName == null ? "" : senderName;
            referenceId = referenceId == null ? "" : referenceId;
        }
    }

    /** Posts a letter. Fire and forget — see the class notes. */
    void send(Letter letter);

    /**
     * Whether mail can currently be posted.
     *
     * False when the API is unreachable, so a caller with an alternative — a notification channel
     * with chat as well — can skip this one instead of queueing a letter nobody will read.
     */
    boolean available();

    /** The implementation used when RobticMail is not installed. */
    MailSender NONE = new MailSender() {

        @Override
        public void send(Letter letter) {
        }

        @Override
        public boolean available() {
            return false;
        }
    };
}
