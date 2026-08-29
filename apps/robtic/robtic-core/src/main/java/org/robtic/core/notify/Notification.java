package org.robtic.core.notify;

import org.robtic.core.util.Ids;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * One thing a player needs to be told, independent of how they are told it.
 *
 * <h2>The sender never picks a channel</h2>
 *
 * A workspace whose licence is about to lapse does not know whether this player reads chat, checks
 * mail or has Discord linked — and it must not, because the answer changes per player, per server
 * and per install. It states the fact and a {@link #category}; the operator decides in
 * {@code notifications.yml} which channels a category reaches, and {@link NotificationService}
 * fans it out.
 *
 * That is what makes "notify the player before they lose the workspace" one call rather than three,
 * and what lets a future channel — a toast, a boss bar, a webhook — be delivered to every existing
 * notification without a single sender changing.
 *
 * <h2>Why the id matters</h2>
 *
 * {@link #id} is a deduplication key, not a database row. "Three days remaining" must be sent once
 * per licence period and not once per sweep, and the sweep runs every few minutes. Channels are
 * fire-and-forget across a network, so the guarantee cannot live at the far end: the dispatcher
 * remembers ids it has already delivered and drops repeats. An id built from the thing and the
 * threshold — {@code business-licence:<workspace>:3d} — is therefore load-bearing, and a sender that
 * generates a random one has silently opted into spamming the player.
 *
 * <h2>Immutable, and safe to hand to several channels at once</h2>
 *
 * Channels may deliver asynchronously and in any order. Nothing here is mutable, so a channel cannot
 * change what a later one sends.
 *
 * @param id        deduplication key; see above. Never blank
 * @param recipient the player being told
 * @param category  which group of channels this reaches, resolved in configuration
 * @param title     one short line. Legacy {@code &} colour codes are accepted
 * @param body      the detail, one entry per line. May be empty for a one-line notice
 * @param priority  how loudly to deliver it; channels interpret this themselves
 * @param channels  channel ids to use INSTEAD of the category's configured set. Empty is the normal
 *                  case and means "whatever the category says"
 * @param context   structured values for channels that render more than text — a Discord embed
 *                  field, an API payload. Never required to understand the notification
 */
public record Notification(
        String id,
        UUID recipient,
        String category,
        String title,
        List<String> body,
        Priority priority,
        Set<String> channels,
        Map<String, String> context
) {

    /**
     * How loudly to deliver.
     *
     * Deliberately three, and deliberately advisory. A channel decides what they mean for it: chat
     * renders {@link #URGENT} with a sound and {@link #INFO} without, mail marks anything above
     * {@link #INFO} important. Adding a fourth level would require every channel to have an opinion
     * about it, which is how a scale stops meaning anything.
     */
    public enum Priority {

        /** Routine. Worth saying, not worth interrupting anybody for. */
        INFO,

        /** The player should act on this reasonably soon. */
        IMPORTANT,

        /** Something is about to be lost. The last warning before a consequence lands. */
        URGENT;

        public boolean atLeast(Priority floor) {
            return ordinal() >= floor.ordinal();
        }
    }

    public Notification {
        id = id == null ? "" : id.trim();
        category = Ids.normalise(category == null ? "general" : category);
        title = title == null ? "" : title;
        body = List.copyOf(body == null ? List.of() : body);
        priority = priority == null ? Priority.INFO : priority;
        channels = Set.copyOf(channels == null ? Set.<String>of() : channels);
        context = Map.copyOf(context == null ? Map.<String, String>of() : context);
    }

    /** Whether this names its own channels rather than taking the category's. */
    public boolean overridesChannels() {
        return !channels.isEmpty();
    }

    /** Title and body as one block, for a channel that has no notion of a heading. */
    public List<String> allLines() {
        List<String> lines = new ArrayList<>(body.size() + 1);

        if (!title.isBlank()) {
            lines.add(title);
        }

        lines.addAll(body);
        return List.copyOf(lines);
    }

    public static Builder to(UUID recipient) {
        return new Builder(recipient);
    }

    /**
     * Assembles a notification.
     *
     * A builder rather than overloaded constructors because the optional parts — priority, extra
     * body lines, context values — are genuinely optional and there are enough of them that a
     * positional constructor would be unreadable at the call site. Every sender in the ecosystem
     * writes {@code Notification.to(uuid).category(...).title(...).line(...).build()}.
     */
    public static final class Builder {

        private final UUID recipient;
        private String id = "";
        private String category = "general";
        private String title = "";
        private final List<String> body = new ArrayList<>();
        private Priority priority = Priority.INFO;
        private final Set<String> channels = new LinkedHashSet<>();
        private final Map<String, String> context = new LinkedHashMap<>();

        private Builder(UUID recipient) {
            this.recipient = recipient;
        }

        /** The deduplication key. See {@link Notification#id}. */
        public Builder id(String value) {
            this.id = value;
            return this;
        }

        public Builder category(String value) {
            this.category = value;
            return this;
        }

        public Builder title(String value) {
            this.title = value;
            return this;
        }

        public Builder line(String value) {
            this.body.add(value == null ? "" : value);
            return this;
        }

        public Builder lines(List<String> values) {
            if (values != null) {
                values.forEach(this::line);
            }
            return this;
        }

        public Builder priority(Priority value) {
            this.priority = value;
            return this;
        }

        /** Forces a specific channel, bypassing the category's configured set. */
        public Builder channel(String value) {
            if (value != null && !value.isBlank()) {
                this.channels.add(Ids.normalise(value));
            }
            return this;
        }

        public Builder context(String key, String value) {
            if (key != null && value != null) {
                this.context.put(key, value);
            }
            return this;
        }

        public Notification build() {
            return new Notification(id, recipient, category, title, body, priority, channels, context);
        }
    }
}
