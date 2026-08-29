package org.robtic.core.statistics.storage;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.core.statistics.api.ResetPolicy;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The one definition of what a stored statistics record looks like as JSON.
 *
 * <h2>Versioned from the first release, not from the first migration</h2>
 *
 * Every record carries {@link #VERSION}. That costs four bytes and a line of code today, and it is
 * the difference between a future schema change being a migration and being an archaeology exercise.
 * Retrofitting a version field means writing code that guesses which shape it is looking at — and
 * guessing wrong about player data is not recoverable.
 *
 * The upgrade path is {@link #decode}: a record at an older version is passed through
 * {@link #migrate}, which is a chain of single-step upgrades. Adding a step is adding one case;
 * nothing else in the module changes, and a record two versions old goes through both steps in order
 * rather than needing a bespoke path.
 *
 * <h2>Reading is total; writing is exact</h2>
 *
 * The same rule the progression codec follows, for the same reason. Every read tolerates a missing,
 * null or wrongly typed field. Stored data outlives the code that wrote it: a statistic added next
 * year is absent from every existing record, and one removed lingers in all of them. A decoder that
 * throws on either turns a schema change into player data loss.
 *
 * <h2>Unknown ids are kept, not dropped</h2>
 *
 * A record frequently holds statistics this server has no definition for — a plugin that is
 * temporarily disabled, or a shared database serving a server with a different feature set. Those
 * values are loaded and written back untouched. Dropping them would mean disabling a plugin for one
 * restart silently deleted every number it had ever recorded.
 */
public final class StatisticsCodec {

    /** The schema version this build writes. */
    public static final int VERSION = 1;

    private StatisticsCodec() {
    }

    // ─── Encode ───────────────────────────────────────────────────────────────────────────────

    public static JsonObject encode(PlayerStatistics statistics) {
        JsonObject root = new JsonObject();
        root.addProperty("version", VERSION);

        JsonObject numbers = new JsonObject();
        statistics.numbers().forEach(numbers::addProperty);
        root.add("values", numbers);

        // Written only when non-empty. Text statistics are rare, and an empty object in every record
        // on the server is bytes spent saying nothing.
        Map<String, String> texts = statistics.texts();

        if (!texts.isEmpty()) {
            JsonObject textJson = new JsonObject();
            texts.forEach(textJson::addProperty);
            root.add("text", textJson);
        }

        Map<ResetPolicy, Long> periods = statistics.periods();

        if (!periods.isEmpty()) {
            JsonObject periodJson = new JsonObject();
            periods.forEach((policy, stamp) -> periodJson.addProperty(policy.name(), stamp));
            root.add("periods", periodJson);
        }

        return root;
    }

    // ─── Decode ───────────────────────────────────────────────────────────────────────────────

    public static PlayerStatistics decode(JsonObject root) {
        PlayerStatistics statistics = PlayerStatistics.empty();

        if (root == null) {
            return statistics;
        }

        JsonObject upgraded = migrate(root, version(root));

        Map<String, Long> numbers = new LinkedHashMap<>();
        JsonObject values = object(upgraded, "values");

        if (values != null) {
            for (String id : values.keySet()) {
                number(values.get(id)).ifPresent(value -> numbers.put(id, value));
            }
        }

        Map<String, String> texts = new LinkedHashMap<>();
        JsonObject textJson = object(upgraded, "text");

        if (textJson != null) {
            for (String id : textJson.keySet()) {
                string(textJson.get(id)).ifPresent(value -> texts.put(id, value));
            }
        }

        Map<ResetPolicy, Long> periods = new LinkedHashMap<>();
        JsonObject periodJson = object(upgraded, "periods");

        if (periodJson != null) {
            for (String name : periodJson.keySet()) {
                ResetPolicy policy = ResetPolicy.parse(name, null);

                if (policy != null) {
                    number(periodJson.get(name)).ifPresent(stamp -> periods.put(policy, stamp));
                }
            }
        }

        statistics.restore(numbers, texts, periods);
        return statistics;
    }

    /**
     * Brings a record forward to {@link #VERSION}.
     *
     * <h2>Adding a migration</h2>
     *
     * Raise {@code VERSION}, add a case for the version being left, and return the record in the
     * shape the next version expects. Steps compose: a version 1 record on a version 3 server runs
     * step 1→2 and then 2→3, so no step has to know about any other.
     *
     * A record claiming a version newer than this build is left exactly as it is. That happens when a
     * shared database is written by an upgraded server and read by one that has not been restarted
     * yet, and the only safe response is to read what can be read and write back what was there —
     * "downgrading" a record by guessing would destroy the newer server's data.
     */
    private static JsonObject migrate(JsonObject root, int from) {
        JsonObject current = root;

        for (int version = from; version < VERSION; version++) {
            current = switch (version) {
                // case 1 -> upgradeOneToTwo(current);
                default -> current;
            };
        }

        return current;
    }

    /**
     * The version a record claims.
     *
     * A record with no version field is treated as version 1 — the shape this build writes — because
     * that is the only shape that has ever existed. If an unversioned shape ever predates this
     * module in some deployment, it gets its own version number and a migration step rather than a
     * special case here.
     */
    private static int version(JsonObject root) {
        JsonElement element = root.get("version");

        if (element == null || !element.isJsonPrimitive()) {
            return VERSION;
        }

        try {
            return element.getAsInt();
        } catch (RuntimeException notANumber) {
            return VERSION;
        }
    }

    // ─── Tolerant accessors ───────────────────────────────────────────────────────────────────

    private static JsonObject object(JsonObject parent, String key) {
        JsonElement element = parent.get(key);
        return element != null && element.isJsonObject() ? element.getAsJsonObject() : null;
    }

    private static java.util.Optional<Long> number(JsonElement element) {
        if (element == null || !element.isJsonPrimitive()) {
            return java.util.Optional.empty();
        }

        try {
            return java.util.Optional.of(element.getAsLong());
        } catch (RuntimeException notANumber) {
            return java.util.Optional.empty();
        }
    }

    private static java.util.Optional<String> string(JsonElement element) {
        if (element == null || !element.isJsonPrimitive()) {
            return java.util.Optional.empty();
        }

        String value = element.getAsString();
        return value == null || value.isBlank() ? java.util.Optional.empty() : java.util.Optional.of(value);
    }
}
