package org.robtic.core.discord;

import com.google.gson.JsonObject;

import java.util.Map;

/**
 * One plugin's contribution to the configuration document this server sends to the API.
 *
 * <h2>Why the document is assembled from several plugins</h2>
 *
 * The bot reads one document describing everything about this server: which channel hosts the status
 * embed, which Discord role means premium, where a jail should be logged. In the monolith all of it
 * lived in {@code config.yml} and one class serialised it.
 *
 * That cannot survive the split, and not only for tidiness. Log routing is the clearest case: the
 * action IDs are {@code jail}, {@code warning_added}, {@code player_report} — all RobticStaff's —
 * plus {@code server_started}, which is Core's. Keeping them in one map means adding a workspace log
 * requires editing a file RobticJobs does not own, and removing a plugin leaves dead routes behind
 * in a config nobody can connect to anything.
 *
 * So each plugin contributes its own, Core merges them, and a plugin that is not installed
 * contributes nothing — which is exactly the right answer for the API, because that server genuinely
 * has no such channel.
 *
 * <h2>Registered as a service, one per plugin</h2>
 *
 * Bukkit's registry holds one provider per interface, so contributors register under this type and
 * Core collects <em>all</em> registrations rather than loading one. See
 * {@code ConfigPushService#push}.
 */
public interface DiscordDocument {

    /**
     * Short lowercase name of the contributing plugin — {@code staff}, {@code premium}.
     *
     * Used only in the log line that says what was pushed, so an operator can see which plugins had
     * something to say and which did not.
     */
    String name();

    /**
     * Log routing this plugin owns: action ID to channel ID.
     *
     * Merged into one table across every contributor. An action ID claimed by two plugins is a
     * genuine conflict and is reported by Core rather than silently resolved.
     */
    default Map<String, String> logChannels() {
        return Map.of();
    }

    /**
     * Anything else this plugin puts in the document, at the top level.
     *
     * The keys are the API's, not this interface's — {@code premiumTiers}, {@code freeHomeLimit} —
     * because the document's shape belongs to the API and inventing a translation layer here would
     * mean two names for every field and a place for them to drift apart.
     */
    default JsonObject extra() {
        return new JsonObject();
    }
}
