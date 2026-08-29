package org.robtic.staff;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.robtic.core.config.MessageCatalog;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The private conversation between a reporter and the staff member who claimed their report.
 *
 * <h2>Two people, no channel</h2>
 *
 * A session is a pair, not a room: exactly one reporter and one staff member, indexed both ways so
 * either participant's chat can be routed in one lookup. Nothing is broadcast, nothing is logged to
 * public chat, and a third player cannot join — there is no command that would let them.
 *
 * <h2>Why chat is intercepted rather than a command</h2>
 *
 * The reporter is upset and mid-problem; asking them to prefix every line with `/rc` is the kind of
 * thing that gets forgotten and posted publicly. Intercepting their chat while a session is open
 * means the private conversation is the *default*, which is the safer failure direction: a message
 * meant for staff going only to staff is fine, the reverse is not.
 */
public final class ReportChatService {

    /** Participant → the session they are in. Both sides are indexed, so routing is one lookup. */
    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();

    private final MessageCatalog messages;

    public ReportChatService(MessageCatalog messages) {
        this.messages = messages;
    }

    /** One live conversation. */
    public record Session(String reportId, UUID reporterUuid, UUID staffUuid, long openedAt) {

        /** The other participant, whichever end is asking. */
        public UUID otherThan(UUID uuid) {
            return uuid.equals(reporterUuid) ? staffUuid : reporterUuid;
        }
    }

    /**
     * Opens a session and tells both sides.
     *
     * Any session either participant is already in is closed first: a staff member claiming a
     * second report should not end up relaying two conversations into one, and silently overwriting
     * the index would leave the abandoned partner talking into a session nobody reads.
     */
    public void open(String reportId, Player reporter, Player staff) {
        closeFor(reporter.getUniqueId(), messages.prefixed("report.session-superseded"));
        closeFor(staff.getUniqueId(), messages.prefixed("report.session-superseded"));

        Session session = new Session(reportId, reporter.getUniqueId(), staff.getUniqueId(), System.currentTimeMillis());

        sessions.put(reporter.getUniqueId(), session);
        sessions.put(staff.getUniqueId(), session);

        for (Component line : messages.lines("report.session-opened-reporter", "staff", staff.getName())) {
            reporter.sendMessage(line);
        }

        for (Component line : messages.lines("report.session-opened-staff", "reporter", reporter.getName())) {
            staff.sendMessage(line);
        }
    }

    /** The session a player is in, if any. */
    public Optional<Session> sessionOf(UUID uuid) {
        return Optional.ofNullable(sessions.get(uuid));
    }

    /** The report a staff member is currently handling, for `/report close`. */
    public Optional<String> reportIdFor(UUID uuid) {
        return sessionOf(uuid).map(Session::reportId);
    }

    public boolean isInSession(UUID uuid) {
        return sessions.containsKey(uuid);
    }

    /**
     * Routes one line to the other participant.
     *
     * @return false when the recipient has gone offline, so the caller can say so rather than
     *         letting the message vanish into a closed session.
     */
    public boolean relay(Player sender, String message) {
        Session session = sessions.get(sender.getUniqueId());

        if (session == null) {
            return false;
        }

        Player recipient = Bukkit.getPlayer(session.otherThan(sender.getUniqueId()));

        if (recipient == null || !recipient.isOnline()) {
            sender.sendMessage(messages.prefixed("report.session-partner-offline"));
            return true;
        }

        boolean fromStaff = sender.getUniqueId().equals(session.staffUuid());
        String key = fromStaff ? "report.chat-from-staff" : "report.chat-from-reporter";

        Component rendered = messages.prefixed(key, "player", sender.getName(), "message", message);

        sender.sendMessage(rendered);
        recipient.sendMessage(rendered);

        return true;
    }

    /** Ends a session by report id, telling whoever is still online. */
    public void close(String reportId, Component notice) {
        sessions.values().stream()
                .filter(session -> session.reportId().equals(reportId))
                .findFirst()
                .ifPresent(session -> end(session, notice));
    }

    /** Ends whatever session a player is in. Used on disconnect and when a session is superseded. */
    public void closeFor(UUID uuid, Component notice) {
        sessionOf(uuid).ifPresent(session -> end(session, notice));
    }

    private void end(Session session, Component notice) {
        sessions.remove(session.reporterUuid());
        sessions.remove(session.staffUuid());

        notify(session.reporterUuid(), notice);
        notify(session.staffUuid(), notice);
    }

    private static void notify(UUID uuid, Component notice) {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null && player.isOnline() && notice != null) {
            player.sendMessage(notice);
        }
    }

    /**
     * Ends a session because one side disconnected.
     *
     * The report itself stays claimed — the staff member has not finished with it, and reopening it
     * for everybody because the reporter's connection dropped would be worse than leaving it held.
     */
    public void handleDisconnect(UUID uuid) {
        closeFor(uuid, messages.prefixed("report.session-partner-left"));
    }
}
