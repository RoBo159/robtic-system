package org.robtic.core.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Everything the plugin knows about one player, as returned by `GET /api/minecraft/player`.
 *
 * Resolved in a single call rather than piecemeal: the join handler and `/admin` both need link,
 * roles, rank and punishment state together, and separate calls would leave windows where the
 * answers disagree with each other.
 */
public record PlayerProfile(
        UUID uuid,
        String username,
        boolean linked,
        String discordId,
        List<String> roleIds,
        List<String> groups,
        boolean frozen,
        boolean jailed,
        int warningCount,
        int noteCount
) {

    /** An unlinked, unpunished placeholder, used when the API cannot be reached. */
    public static PlayerProfile unknown(UUID uuid, String username) {
        return new PlayerProfile(uuid, username, false, null, List.of(), List.of(), false, false, 0, 0);
    }

    public static PlayerProfile fromJson(JsonObject json) {
        return new PlayerProfile(
                UUID.fromString(json.get("uuid").getAsString()),
                optionalString(json, "username", "unknown"),
                json.has("linked") && json.get("linked").getAsBoolean(),
                optionalString(json, "discordId", null),
                stringList(json, "roleIds"),
                stringList(json, "groups"),
                json.has("frozen") && json.get("frozen").getAsBoolean(),
                json.has("jailed") && json.get("jailed").getAsBoolean(),
                optionalInt(json, "warningCount"),
                optionalInt(json, "noteCount")
        );
    }

    private static String optionalString(JsonObject json, String key, String fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsString();
    }

    private static int optionalInt(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? 0 : element.getAsInt();
    }

    private static List<String> stringList(JsonObject json, String key) {
        JsonElement element = json.get(key);
        if (element == null || !element.isJsonArray()) {
            return List.of();
        }

        JsonArray array = element.getAsJsonArray();
        List<String> values = new ArrayList<>(array.size());
        for (JsonElement item : array) {
            if (!item.isJsonNull()) {
                values.add(item.getAsString());
            }
        }
        return List.copyOf(values);
    }
}
