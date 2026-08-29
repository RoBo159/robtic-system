package org.robtic.minecraft.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * One player report, as the API returns it.
 *
 * <h2>The code, not the id</h2>
 *
 * Two identifiers travel together and they are not interchangeable. {@link #id()} is the database
 * key and is what the GUI passes back when a staff member clicks a report. {@link #code()} is six
 * digits and is the only one a human ever reads or types — in the Discord embed, in the chat alert,
 * and in `/report accept <code>`. Printing the id anywhere a person has to retype it would be a
 * twenty-four character hex string, which is how transcription errors happen.
 *
 * <h2>Everything here may be absent</h2>
 *
 * A report can be filed by an unlinked player, against an offline player, from a world that has
 * since unloaded. So the Discord ids and both locations are nullable, and every consumer renders
 * what is missing rather than refusing to render at all — a report with no coordinates still has the
 * reason on it, which is the part staff actually need.
 */
public record Report(
        String id,
        String code,
        UUID reporterUuid,
        String reporterUsername,
        String reporterDiscordId,
        Position reporterLocation,
        UUID targetUuid,
        String targetUsername,
        String targetDiscordId,
        Position targetLocation,
        boolean targetOnline,
        String reason,
        String status,
        String assignedToUsername,
        String resolvedByUsername,
        boolean jailApplied,
        String createdAt,
        String serverId
) {

    /** Where somebody was standing. Block coordinates are all anybody reads off one of these. */
    public record Position(String world, double x, double y, double z, String serverId) {

        /** "world 128, 64, -310" — the form a staff member would type into `/tp`. */
        public String describe() {
            return world + " " + Math.round(x) + ", " + Math.round(y) + ", " + Math.round(z);
        }
    }

    public boolean isOpen() {
        return "open".equals(status) || "reviewing".equals(status);
    }

    public boolean reporterLinked() {
        return reporterDiscordId != null && !reporterDiscordId.isBlank();
    }

    public boolean targetLinked() {
        return targetDiscordId != null && !targetDiscordId.isBlank();
    }

    public static Report fromJson(JsonObject json) {
        return new Report(
                string(json, "id", ""),
                string(json, "code", ""),
                uuid(json, "reporterUuid"),
                string(json, "reporterUsername", "unknown"),
                string(json, "reporterDiscordId", null),
                position(json, "reporterLocation"),
                uuid(json, "targetUuid"),
                string(json, "targetUsername", "unknown"),
                string(json, "targetDiscordId", null),
                position(json, "targetLocation"),
                bool(json, "targetOnline"),
                string(json, "reason", ""),
                string(json, "status", "open"),
                string(json, "assignedToUsername", null),
                string(json, "resolvedByUsername", null),
                bool(json, "jailApplied"),
                string(json, "createdAt", ""),
                string(json, "serverId", "")
        );
    }

    /** Reads an `{ items: [...] }` envelope, which is the shape every list endpoint returns. */
    public static List<Report> listFromJson(JsonObject json) {
        JsonElement items = json.get("items");

        if (items == null || !items.isJsonArray()) {
            return List.of();
        }

        JsonArray array = items.getAsJsonArray();
        List<Report> reports = new ArrayList<>(array.size());

        for (JsonElement element : array) {
            if (element.isJsonObject()) {
                reports.add(fromJson(element.getAsJsonObject()));
            }
        }

        return List.copyOf(reports);
    }

    private static Position position(JsonObject json, String key) {
        JsonElement element = json.get(key);

        if (element == null || !element.isJsonObject()) {
            return null;
        }

        JsonObject location = element.getAsJsonObject();
        String world = string(location, "world", null);

        // A position with no world cannot be described or teleported to, so it is no position.
        if (world == null || world.isBlank()) {
            return null;
        }

        return new Position(
                world,
                number(location, "x"),
                number(location, "y"),
                number(location, "z"),
                string(location, "serverId", null)
        );
    }

    private static String string(JsonObject json, String key, String fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsString();
    }

    private static double number(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? 0d : element.getAsDouble();
    }

    private static boolean bool(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element != null && !element.isJsonNull() && element.getAsBoolean();
    }

    /**
     * A uuid field, or null when it is absent or malformed.
     *
     * Tolerant rather than throwing: a report is still worth showing to staff if one of its uuids
     * cannot be parsed, and the alternative is a GUI that refuses to open over a single bad row.
     */
    private static UUID uuid(JsonObject json, String key) {
        String value = string(json, key, null);

        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }
}
