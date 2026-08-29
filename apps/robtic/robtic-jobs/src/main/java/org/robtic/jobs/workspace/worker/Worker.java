package org.robtic.jobs.workspace.worker;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Somebody employed by a business.
 *
 * <h2>Sealed, because the two kinds genuinely are different</h2>
 *
 * An {@link NpcWorker} has a profession, a work area, somewhere to put what it produces, and a
 * maintenance bill. A {@link PlayerWorker} has an account, a set of permissions, a wage and a job to
 * do. There is almost no overlap, and the temptation to model them as one record with a {@code type}
 * flag was resisted for a reason: half the fields would be permanently empty, and every reader would
 * have to know which half applied to the row in front of it.
 *
 * Sealing them instead means a {@code switch} over a worker is checked by the compiler. When a third
 * kind arrives — a contractor, a hired mercenary — every place that has to care fails to compile
 * rather than silently ignoring it.
 *
 * <h2>Both live on the business, not in a store of their own</h2>
 *
 * Workers are serialised into the workspace record. That is deliberate: hiring is then one write
 * that either lands or does not, abandonment removes them with everything else automatically, and
 * there is no second store that can disagree with the first about who works where. A business has a
 * handful of employees at most, so the record stays small.
 */
public sealed interface Worker permits NpcWorker, PlayerWorker {

    /** Generated, and stable for as long as this worker is employed. */
    String id();

    /** When they were taken on, epoch millis. */
    long hiredAt();

    /** What they are paid per interval, in Robs. */
    double salary();

    /** A short line naming this worker, for menus and log lines. */
    String describe();

    JsonObject toJson();

    /**
     * Reads a worker of either kind.
     *
     * The discriminator is written by {@link #toJson}; a row with an unrecognised one is dropped
     * rather than failing the whole business, on the same principle as an unparseable NPC handle.
     */
    static Optional<Worker> fromJson(JsonObject json) {
        if (json == null || !json.has("kind")) {
            return Optional.empty();
        }

        try {
            return switch (json.get("kind").getAsString()) {
                case "npc" -> NpcWorker.fromJson(json).map(worker -> worker);
                case "player" -> PlayerWorker.fromJson(json).map(worker -> worker);
                default -> Optional.empty();
            };
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }

    // ─── Shared decoding helpers ──────────────────────────────────────────────────────────────

    static String string(JsonObject json, String key, String fallback) {
        return json.has(key) && json.get(key).isJsonPrimitive() ? json.get(key).getAsString() : fallback;
    }

    static long number(JsonObject json, String key, long fallback) {
        try {
            return json.has(key) && json.get(key).isJsonPrimitive() ? json.get(key).getAsLong() : fallback;
        } catch (RuntimeException notANumber) {
            return fallback;
        }
    }

    static double decimal(JsonObject json, String key, double fallback) {
        try {
            return json.has(key) && json.get(key).isJsonPrimitive() ? json.get(key).getAsDouble() : fallback;
        } catch (RuntimeException notANumber) {
            return fallback;
        }
    }

    static Set<String> strings(JsonObject json, String key) {
        Set<String> values = new LinkedHashSet<>();

        if (json.has(key) && json.get(key).isJsonArray()) {
            JsonArray array = json.getAsJsonArray(key);
            array.forEach(element -> values.add(element.getAsString()));
        }

        return values;
    }

    static JsonArray array(Set<String> values) {
        JsonArray array = new JsonArray();
        values.forEach(array::add);
        return array;
    }

    static UUID uuid(JsonObject json, String key) {
        try {
            return json.has(key) ? UUID.fromString(json.get(key).getAsString()) : null;
        } catch (RuntimeException malformed) {
            return null;
        }
    }
}
