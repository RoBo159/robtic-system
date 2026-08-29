package org.robtic.core.notify;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.core.util.Ids;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Everything {@code notifications.yml} configures.
 *
 * Parsed into one immutable object and swapped wholesale on reload, so a half-applied reload cannot
 * leave the dispatcher routing one category by the new rules and another by the old.
 */
public final class NotificationSettings {

    /**
     * Where one category's notifications go.
     *
     * @param channels        channel ids, in the order they are tried
     * @param minimumPriority notifications below this are dropped for this category, which is how an
     *                        operator turns down a chatty system without editing its code
     */
    public record Route(Set<String> channels, Notification.Priority minimumPriority) {

        public Route {
            channels = Set.copyOf(channels);
            minimumPriority = minimumPriority == null ? Notification.Priority.INFO : minimumPriority;
        }

        public boolean accepts(Notification.Priority priority) {
            return priority.atLeast(minimumPriority);
        }
    }

    private final boolean enabled;
    private final Duration dedupeWindow;
    private final int dedupeCapacity;

    private final Route fallback;
    private final Map<String, Route> categories;
    private final Set<String> disabledChannels;

    private final String mailCategory;
    private final String discordChannelId;

    public NotificationSettings(ConfigurationSection root, Logger logger) {
        ConfigurationSection config = root == null ? new MemoryConfiguration() : root;

        this.enabled = config.getBoolean("enabled", true);

        // Clamped rather than trusted. A window of zero would make every sweep re-notify, which is
        // precisely the failure the deduplication exists to prevent, and it is an easy typo.
        this.dedupeWindow = Duration.ofMinutes(Math.max(1L, config.getLong("dedupe-minutes", 10_080L)));
        this.dedupeCapacity = Math.max(64, config.getInt("dedupe-max", 20_000));

        this.fallback = new Route(
                lowercase(config.getStringList("default-channels")),
                priority(config.getString("default-minimum-priority", "info"), logger));

        this.categories = readCategories(config.getConfigurationSection("categories"), fallback, logger);

        ConfigurationSection channels = section(config, "channels");
        this.disabledChannels = readDisabled(channels);

        this.mailCategory = section(channels, "mail").getString("mail-category", "system");
        this.discordChannelId = section(channels, "discord").getString("channel-id", "");
    }

    private static ConfigurationSection section(ConfigurationSection parent, String name) {
        ConfigurationSection found = parent.getConfigurationSection(name);
        return found == null ? new MemoryConfiguration() : found;
    }

    private static Map<String, Route> readCategories(
            ConfigurationSection section,
            Route fallback,
            Logger logger
    ) {
        Map<String, Route> routes = new LinkedHashMap<>();

        if (section == null) {
            return routes;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body == null) {
                continue;
            }

            // A category that lists no channels inherits the default set rather than reaching
            // nobody. An empty list is nearly always an unfinished edit, and silently muting a
            // system is the most expensive way to interpret one.
            Set<String> channels = lowercase(body.getStringList("channels"));

            if (channels.isEmpty()) {
                logger.warning("notifications.yml → categories → " + key + " lists no channels, so it"
                        + " will use default-channels. Set channels: [] deliberately by disabling the"
                        + " category's senders instead.");
                channels = fallback.channels();
            }

            routes.put(Ids.normalise(key), new Route(
                    channels,
                    priority(body.getString("minimum-priority", "info"), logger)));
        }

        return routes;
    }

    /** Channel ids an operator has switched off, so the dispatcher never even asks them. */
    private static Set<String> readDisabled(ConfigurationSection channels) {
        Set<String> disabled = new LinkedHashSet<>();

        for (String key : channels.getKeys(false)) {
            ConfigurationSection body = channels.getConfigurationSection(key);

            if (body != null && !body.getBoolean("enabled", true)) {
                disabled.add(Ids.normalise(key));
            }
        }

        return disabled;
    }

    private static Notification.Priority priority(String raw, Logger logger) {
        if (raw == null || raw.isBlank()) {
            return Notification.Priority.INFO;
        }

        try {
            return Notification.Priority.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning("notifications.yml: \"" + raw + "\" is not a priority (info, important,"
                    + " urgent). Treated as info.");
            return Notification.Priority.INFO;
        }
    }

    private static Set<String> lowercase(List<String> values) {
        Set<String> normalised = new LinkedHashSet<>();
        values.forEach(value -> normalised.add(Ids.normalise(value)));
        return normalised;
    }

    // ─── Accessors ────────────────────────────────────────────────────────────────────────────

    public boolean enabled() {
        return enabled;
    }

    public Duration dedupeWindow() {
        return dedupeWindow;
    }

    public int dedupeCapacity() {
        return dedupeCapacity;
    }

    /** The route for a category, falling back to the default set for one nobody configured. */
    public Route route(String category) {
        return categories.getOrDefault(Ids.normalise(category), fallback);
    }

    public boolean channelEnabled(String channelId) {
        return !disabledChannels.contains(Ids.normalise(channelId));
    }

    /** The mail category business notifications are posted under. See {@code MailSender}. */
    public String mailCategory() {
        return mailCategory;
    }

    /** The Discord channel notifications are mirrored to, or blank for none. */
    public String discordChannelId() {
        return discordChannelId;
    }
}
