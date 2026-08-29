package org.robtic.core.notify;

import org.bukkit.plugin.Plugin;
import org.robtic.core.util.Ids;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * Routes notifications to channels, and refuses to send the same one twice.
 *
 * <h2>Deduplication is the whole reason this is not a for-loop</h2>
 *
 * Every system that warns about something approaching does so from a sweep, because the alternative
 * — scheduling a task per player per threshold — is thousands of timers that a restart loses. A
 * sweep re-observes the same fact on every pass: a licence with two days left still has two days
 * left a minute later. Without a memory of what has already been said, "one day remaining" is
 * delivered every sweep until it becomes "expired".
 *
 * So a delivered {@link Notification#id()} is remembered, and repeats are dropped. The memory is
 * bounded two ways — by age and by count — because it is otherwise a map that only ever grows on a
 * long-running server.
 *
 * <h2>Why the memory is not persisted</h2>
 *
 * A restart forgets what was delivered, and the next sweep re-sends the thresholds that are still
 * true. That is the right trade: persisting it would mean a player who was warned before a crash is
 * never warned again, and being told twice that a business is about to be lost is a far cheaper
 * mistake than not being told at all.
 *
 * <h2>One bad channel never costs the others</h2>
 *
 * Channels are tried in the order the category lists them, each inside its own guard. A Discord
 * outage must not swallow the in-game warning that would have saved somebody's workspace.
 */
public final class NotificationDispatcher implements NotificationService {

    private final Plugin plugin;
    private final Map<String, NotificationChannel> channels = new ConcurrentHashMap<>();

    private volatile NotificationSettings settings;

    /**
     * Notification id → when it may be sent again.
     *
     * Access-ordered and capacity-bounded, so a server that generates far more distinct ids than
     * expected evicts the oldest rather than growing without limit. Guarded by its own monitor: the
     * dispatcher is called from the main thread today, but a channel or a future async sweep calling
     * in would otherwise corrupt it silently.
     */
    private final LinkedHashMap<String, Long> delivered;

    public NotificationDispatcher(Plugin plugin, NotificationSettings settings) {
        this.plugin = plugin;
        this.settings = settings;

        this.delivered = new LinkedHashMap<>(256, 0.75f, true) {

            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > NotificationDispatcher.this.settings.dedupeCapacity();
            }
        };
    }

    public void settings(NotificationSettings replacement) {
        this.settings = replacement;
    }

    // ─── Channels ─────────────────────────────────────────────────────────────────────────────

    @Override
    public void register(NotificationChannel channel) {
        if (channel == null || channel.id() == null || channel.id().isBlank()) {
            return;
        }

        String id = Ids.normalise(channel.id());
        NotificationChannel replaced = channels.put(id, channel);

        // Said at FINE rather than WARNING: replacing a built-in is the documented way a server owner
        // overrides one, so it is a deliberate act and not a collision worth alarming anybody about.
        plugin.getLogger().fine(replaced == null
                ? "Registered the \"" + id + "\" notification channel."
                : "Replaced the \"" + id + "\" notification channel.");
    }

    @Override
    public boolean has(String channelId) {
        NotificationChannel channel = channels.get(Ids.normalise(channelId));
        return channel != null && channel.available();
    }

    /** Every registered channel id, for the diagnostics command and the config check. */
    public Set<String> registered() {
        return Set.copyOf(channels.keySet());
    }

    // ─── Sending ──────────────────────────────────────────────────────────────────────────────

    @Override
    public void send(Notification notification) {
        if (notification == null || !settings.enabled()) {
            return;
        }

        NotificationSettings.Route route = settings.route(notification.category());

        if (!route.accepts(notification.priority())) {
            return;
        }

        if (!remember(notification.id())) {
            return;
        }

        // A notification naming its own channels bypasses the category, which is how a system that
        // genuinely must reach one transport — a debug notice, an operator alert — says so. The
        // common case is empty, and takes the configured route.
        Set<String> wanted = notification.overridesChannels() ? notification.channels() : route.channels();

        for (String id : wanted) {
            deliver(id, notification);
        }
    }

    private void deliver(String channelId, Notification notification) {
        if (!settings.channelEnabled(channelId)) {
            return;
        }

        NotificationChannel channel = channels.get(channelId);

        if (channel == null) {
            // Once per notification rather than once per config load, because the config check cannot
            // see channels an optional plugin registers at runtime. Kept at FINE for exactly that
            // reason: "mail" being unroutable on a server without RobticMail is not a misconfiguration.
            plugin.getLogger().fine("The notification category \"" + notification.category()
                    + "\" routes to the channel \"" + channelId + "\", which nothing has registered.");
            return;
        }

        if (!channel.available()) {
            return;
        }

        try {
            channel.deliver(notification);
        } catch (RuntimeException failure) {
            plugin.getLogger().log(Level.WARNING, "The notification channel \"" + channelId
                    + "\" threw while delivering \"" + notification.id() + "\" and was skipped."
                    + " The remaining channels were still tried.", failure);
        }
    }

    /**
     * Claims an id, or reports that it has already been delivered.
     *
     * A blank id is always accepted and never remembered — a sender that has no natural
     * deduplication key is sending something genuinely one-off, and forcing it to invent one would
     * only produce random strings that fill the map.
     *
     * @return true when the caller should go ahead
     */
    private boolean remember(String id) {
        if (id == null || id.isBlank()) {
            return true;
        }

        long now = System.currentTimeMillis();

        synchronized (delivered) {
            Long until = delivered.get(id);

            if (until != null && until > now) {
                return false;
            }

            delivered.put(id, now + settings.dedupeWindow().toMillis());
            return true;
        }
    }

    /**
     * Forgets an id, so the next send goes through.
     *
     * The renewal path needs this: a player warned that their licence expires in a day, who then
     * renews and lets it run down again, must be warned the second time too. Without it the
     * threshold is a once-per-window event rather than a once-per-licence-period one.
     */
    public void forget(String id) {
        if (id == null || id.isBlank()) {
            return;
        }

        synchronized (delivered) {
            delivered.remove(id);
        }
    }

    /** Forgets every id beginning with a prefix — one business's whole set of thresholds. */
    public void forgetPrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return;
        }

        synchronized (delivered) {
            delivered.keySet().removeIf(id -> id.startsWith(prefix));
        }
    }

    /** Drops the deduplication memory. Called on disable. */
    public void clear() {
        synchronized (delivered) {
            delivered.clear();
        }

        channels.clear();
    }
}
