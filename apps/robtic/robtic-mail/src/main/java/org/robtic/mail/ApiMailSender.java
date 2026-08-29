package org.robtic.mail;

import org.robtic.core.api.ApiGateway;
import org.robtic.core.mail.MailSender;

/**
 * Core's {@code MailSender} contract, backed by this plugin's service.
 *
 * <h2>An adapter, and nothing more</h2>
 *
 * The same shape as {@link BukkitMailbox}: a small class whose only job is to let something outside
 * the mail system post a letter without compiling against {@link MailService}. The notification
 * system's mail channel is the first caller; a completed contract or a marketplace sale would be the
 * next, and none of them learns that this plugin exists.
 *
 * <h2>Available means queueable, not delivered</h2>
 *
 * {@link #available()} reports whether the gateway believes the API is reachable. A caller with an
 * alternative — a notification category listing chat as well — uses it to skip a channel that cannot
 * work. It is deliberately not "will this arrive": the request queue retries across an outage, so a
 * letter posted while the API is down usually does arrive, just later.
 */
public final class ApiMailSender implements MailSender {

    private final MailService mail;
    private final ApiGateway gateway;

    public ApiMailSender(MailService mail, ApiGateway gateway) {
        this.mail = mail;
        this.gateway = gateway;
    }

    @Override
    public void send(Letter letter) {
        mail.send(
                letter.recipient(),
                letter.username(),
                letter.category(),
                letter.subject(),
                letter.body(),
                letter.senderName(),
                letter.important(),
                letter.referenceId());
    }

    @Override
    public boolean available() {
        return gateway.isAvailable();
    }
}
