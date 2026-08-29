package org.robtic.core.discord;

import org.bukkit.configuration.ConfigurationSection;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * One plugin's {@code discord:} section.
 *
 * <pre>
 * discord:
 *   enabled: false
 *   channels:
 *     logs: ""
 *     actions: ""
 *   roles:
 *     premium: ""
 * </pre>
 *
 * <h2>Every plugin owns its own IDs</h2>
 *
 * RobticStaff's log channel lives in {@code staff.yml}; RobticPremium's role IDs live in
 * {@code premium.yml}. None of them live in RobticDiscord, and none in Core.
 *
 * The reason is not tidiness. A channel ID in a central file means adding a workspace log requires
 * editing a config another plugin owns, and it means an operator who removes a plugin is left with
 * dead IDs in a file they cannot connect to anything. Each plugin's IDs disappear with the plugin.
 *
 * <h2>Off by default, and silent when off</h2>
 *
 * {@code enabled: false} is the shipped default everywhere. A server that has not set Discord up
 * gets no warnings, no checks and no startup cost — see {@link DiscordIntegration}.
 *
 * <h2>Validation warns and never refuses</h2>
 *
 * A Discord snowflake is 17–20 digits. Anything else in an ID field is almost always a channel
 * <em>name</em> pasted instead of an ID, which is the single most common setup mistake and is
 * invisible at runtime — the message is simply never delivered. It is reported at load, by name,
 * and the feature is left disabled rather than failing later with nothing to point at.
 */
public final class DiscordSettings {

    /** A Discord snowflake: 17 to 20 digits. */
    private static final java.util.regex.Pattern SNOWFLAKE =
            java.util.regex.Pattern.compile("\\d{17,20}");

    private final boolean enabled;
    private final Map<String, String> channels;
    private final Map<String, String> roles;

    private DiscordSettings(boolean enabled, Map<String, String> channels, Map<String, String> roles) {
        this.enabled = enabled;
        this.channels = Map.copyOf(channels);
        this.roles = Map.copyOf(roles);
    }

    /** What a plugin with no {@code discord:} section gets: off, with nothing configured. */
    public static DiscordSettings disabled() {
        return new DiscordSettings(false, Map.of(), Map.of());
    }

    /**
     * Reads a {@code discord:} section and reports what is wrong with it.
     *
     * @param section the {@code discord} block, or null when the file has none
     * @param where   the file this came from, for warnings — {@code "staff.yml"}
     */
    public static DiscordSettings parse(ConfigurationSection section, String where, Logger logger) {
        if (section == null) {
            return disabled();
        }

        boolean enabled = section.getBoolean("enabled", false);

        Map<String, String> channels = read(section.getConfigurationSection("channels"));
        Map<String, String> roles = read(section.getConfigurationSection("roles"));

        // Only validated when the operator has actually turned Discord on. Warning about a blank
        // channel in a section nobody enabled would be a line in every console on every start.
        if (enabled) {
            validate(channels, "channel", where, logger);
            validate(roles, "role", where, logger);
            warnAboutDuplicates(channels, where, logger);
        }

        return new DiscordSettings(enabled, channels, roles);
    }

    private static Map<String, String> read(ConfigurationSection section) {
        Map<String, String> values = new LinkedHashMap<>();

        if (section == null) {
            return values;
        }

        for (String key : section.getKeys(false)) {
            String value = section.getString(key, "");

            if (value != null && !value.isBlank()) {
                values.put(key, value.trim());
            }
        }

        return values;
    }

    /**
     * Names anything that is not a snowflake.
     *
     * The value is kept rather than dropped: an operator who has genuinely configured something this
     * check does not understand should not have it silently discarded. It will simply not resolve on
     * Discord's side, which is where the real authority is.
     */
    private static void validate(Map<String, String> values, String kind, String where, Logger logger) {
        values.forEach((key, value) -> {
            if (!SNOWFLAKE.matcher(value).matches()) {
                logger.warning(where + " → discord." + kind + "s." + key + ": \"" + value
                        + "\" is not a Discord ID. IDs are 17-20 digits — turn on Developer Mode in"
                        + " Discord and use \"Copy ID\" rather than typing the name.");
            }
        });
    }

    /**
     * Two names pointing at one channel.
     *
     * Legal, and occasionally deliberate — logs and actions in one channel is a reasonable small
     * server setup. Reported anyway because the far more common cause is a copy-paste that was meant
     * to be two different channels.
     */
    private static void warnAboutDuplicates(Map<String, String> channels, String where, Logger logger) {
        Map<String, String> seen = new LinkedHashMap<>();
        Set<String> reported = new LinkedHashSet<>();

        channels.forEach((key, value) -> {
            String first = seen.putIfAbsent(value, key);

            if (first != null && reported.add(value)) {
                logger.warning(where + " → discord.channels: \"" + first + "\" and \"" + key
                        + "\" are the same channel. That works, but check it is deliberate.");
            }
        });
    }

    /** Whether this plugin's operator has turned Discord on. */
    public boolean enabled() {
        return enabled;
    }

    /** A channel ID by its configured name, or empty when unset. */
    public Optional<String> channel(String name) {
        return Optional.ofNullable(channels.get(name)).filter(id -> !id.isBlank());
    }

    /** A role ID by its configured name, or empty when unset. */
    public Optional<String> role(String name) {
        return Optional.ofNullable(roles.get(name)).filter(id -> !id.isBlank());
    }

    public Map<String, String> channels() {
        return channels;
    }

    public Map<String, String> roles() {
        return roles;
    }

    /** Whether anything at all was configured, for deciding if an enabled section is empty. */
    public boolean isEmpty() {
        return channels.isEmpty() && roles.isEmpty();
    }
}
