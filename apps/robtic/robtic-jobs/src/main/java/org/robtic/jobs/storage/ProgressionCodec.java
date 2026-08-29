package org.robtic.jobs.storage;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.jobs.jobs.JobProgress;
import org.robtic.jobs.jobs.JobStatistics;
import org.robtic.jobs.jobs.PlayerJobs;
import org.robtic.core.titles.PlayerTitles;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The one definition of what stored progression looks like as JSON.
 *
 * Shared by both {@link ProgressionStorage} implementations rather than written twice, so a file
 * written by the YAML backend can be read by the API backend and vice versa. That is what makes
 * migrating between them a copy rather than a conversion — and it is the reason this is a separate
 * class instead of two {@code toJson} methods that would inevitably diverge.
 *
 * <h2>Reading is total; writing is exact</h2>
 *
 * Every read path tolerates a missing, null or wrongly typed field and falls back to a sane value.
 * Stored data outlives the code that wrote it: a field added next year will be absent from every
 * existing record, and a field removed will linger in all of them. A decoder that throws on either
 * turns a schema change into player data loss.
 *
 * The one thing it will not do is silently repair a value into something meaningful — an unreadable
 * job block yields no job, not a level 1 job, because inventing progression is worse than losing it.
 */
public final class ProgressionCodec {

    private ProgressionCodec() {
    }

    // ─── Encode ───────────────────────────────────────────────────────────────────────────────

    public static JsonObject encode(PlayerProgression progression) {
        JsonObject root = new JsonObject();
        root.add("titles", encodeTitles(progression.titles()));
        root.add("jobs", encodeJobs(progression.jobs()));
        return root;
    }

    private static JsonObject encodeTitles(PlayerTitles titles) {
        JsonObject json = new JsonObject();

        JsonArray owned = new JsonArray();
        titles.owned().forEach(owned::add);
        json.add("owned", owned);

        titles.equipped().ifPresent(id -> json.addProperty("equipped", id));

        return json;
    }

    private static JsonObject encodeJobs(PlayerJobs jobs) {
        JsonObject json = new JsonObject();

        JsonObject owned = new JsonObject();
        jobs.owned().forEach((id, progress) -> owned.add(id, encodeProgress(progress)));
        json.add("owned", owned);

        JsonArray active = new JsonArray();
        jobs.active().forEach(active::add);
        json.add("active", active);

        return json;
    }

    private static JsonObject encodeProgress(JobProgress progress) {
        JsonObject json = new JsonObject();
        json.addProperty("xp", progress.totalXp());
        json.addProperty("joinedAt", progress.joinedAt());
        json.addProperty("lastInteraction", progress.lastInteraction());

        JsonObject statistics = new JsonObject();
        progress.statistics().counters().forEach(statistics::addProperty);
        json.add("statistics", statistics);

        JsonArray titles = new JsonArray();
        progress.unlockedTitles().forEach(titles::add);
        json.add("unlockedTitles", titles);

        return json;
    }

    // ─── Decode ───────────────────────────────────────────────────────────────────────────────

    public static PlayerProgression decode(JsonObject root) {
        if (root == null) {
            return PlayerProgression.EMPTY;
        }

        return new PlayerProgression(
                decodeTitles(object(root, "titles")),
                decodeJobs(object(root, "jobs")));
    }

    private static PlayerTitles decodeTitles(JsonObject json) {
        if (json == null) {
            return PlayerTitles.EMPTY;
        }

        Set<String> owned = new LinkedHashSet<>();

        JsonArray array = array(json, "owned");
        if (array != null) {
            for (JsonElement element : array) {
                string(element).ifPresent(owned::add);
            }
        }

        Optional<String> equipped = json.has("equipped") && !json.get("equipped").isJsonNull()
                ? string(json.get("equipped"))
                : Optional.empty();

        // An equipped title the player does not own is dropped rather than trusted. It can only come
        // from a partially applied write or a hand edit, and honouring it would let a player wear
        // something they never unlocked.
        return new PlayerTitles(owned, equipped.filter(owned::contains));
    }

    private static PlayerJobs decodeJobs(JsonObject json) {
        if (json == null) {
            return PlayerJobs.EMPTY;
        }

        Map<String, JobProgress> owned = new LinkedHashMap<>();
        JsonObject ownedJson = object(json, "owned");

        if (ownedJson != null) {
            for (String jobId : ownedJson.keySet()) {
                decodeProgress(jobId, object(ownedJson, jobId)).ifPresent(p -> owned.put(jobId, p));
            }
        }

        Set<String> active = new LinkedHashSet<>();
        JsonArray activeJson = array(json, "active");

        if (activeJson != null) {
            for (JsonElement element : activeJson) {
                string(element).ifPresent(active::add);
            }
        }

        // PlayerJobs' constructor drops actives that are not owned, so a record that lost a job block
        // but kept it in the active list repairs itself here rather than propagating the mismatch.
        return new PlayerJobs(owned, active);
    }

    private static Optional<JobProgress> decodeProgress(String jobId, JsonObject json) {
        if (json == null) {
            return Optional.empty();
        }

        Map<String, Long> counters = new LinkedHashMap<>();
        JsonObject statistics = object(json, "statistics");

        if (statistics != null) {
            for (String key : statistics.keySet()) {
                number(statistics.get(key)).ifPresent(value -> counters.put(key, value));
            }
        }

        Set<String> titles = new LinkedHashSet<>();
        JsonArray unlocked = array(json, "unlockedTitles");

        if (unlocked != null) {
            for (JsonElement element : unlocked) {
                string(element).ifPresent(titles::add);
            }
        }

        long now = System.currentTimeMillis();

        return Optional.of(new JobProgress(
                jobId,
                number(json.get("xp")).orElse(0L),
                new JobStatistics(counters),
                titles,
                number(json.get("joinedAt")).orElse(now),
                number(json.get("lastInteraction")).orElse(now)));
    }

    // ─── Tolerant accessors ───────────────────────────────────────────────────────────────────

    private static JsonObject object(JsonObject parent, String key) {
        JsonElement element = parent.get(key);
        return element != null && element.isJsonObject() ? element.getAsJsonObject() : null;
    }

    private static JsonArray array(JsonObject parent, String key) {
        JsonElement element = parent.get(key);
        return element != null && element.isJsonArray() ? element.getAsJsonArray() : null;
    }

    private static Optional<String> string(JsonElement element) {
        if (element == null || !element.isJsonPrimitive()) {
            return Optional.empty();
        }

        String value = element.getAsString();
        return value == null || value.isBlank() ? Optional.empty() : Optional.of(value);
    }

    private static Optional<Long> number(JsonElement element) {
        if (element == null || !element.isJsonPrimitive()) {
            return Optional.empty();
        }

        try {
            return Optional.of(element.getAsLong());
        } catch (NumberFormatException notANumber) {
            return Optional.empty();
        }
    }
}
