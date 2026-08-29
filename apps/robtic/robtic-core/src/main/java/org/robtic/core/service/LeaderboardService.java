package org.robtic.core.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.config.ApiSettings;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * The coin leaderboard, held in memory and refreshed on a timer.
 *
 * It exists as a cache rather than as a call because of who asks for it. A placeholder is resolved
 * on the main thread, several times a second, once per player on a TAB refresh — so the answer has
 * to already be in memory. Fetching on demand would put an HTTP round trip inside the server tick,
 * which is the one thing the rest of this plugin is arranged to avoid.
 *
 * More rows are fetched than a board usually shows, so that a player outside the visible top still
 * has a real position to display rather than a blank.
 */
public final class LeaderboardService {

    /** Rows fetched per refresh. Deep enough that most players have a position, still one query. */
    private static final int FETCH_LIMIT = 100;

    private final ApiClient client;
    private final ApiSettings settings;
    private final Logger logger;

    /** Replaced wholesale on refresh, so a reader never sees a half-updated board. */
    private volatile List<Entry> entries = List.of();

    public LeaderboardService(ApiClient client, ApiSettings settings, Logger logger) {
        this.client = client;
        this.settings = settings;
        this.logger = logger;
    }

    /** One row of the board. */
    public record Entry(int position, String username, String uuid, double robs) {
    }

    /** Refreshes from the API. Must run off the main thread. */
    public void refresh() {
        try {
            JsonObject response = client.get("/api/robs/leaderboard", Map.of(
                    "guildId", settings.guildId(),
                    "limit", String.valueOf(FETCH_LIMIT)
            ));

            JsonElement rows = response.get("entries");
            if (rows == null || !rows.isJsonArray()) {
                return;
            }

            JsonArray array = rows.getAsJsonArray();
            List<Entry> parsed = new ArrayList<>(array.size());

            for (JsonElement element : array) {
                if (!element.isJsonObject()) {
                    continue;
                }

                JsonObject row = element.getAsJsonObject();
                parsed.add(new Entry(
                        optionalInt(row, "position", parsed.size() + 1),
                        optionalString(row, "username", "—"),
                        optionalString(row, "uuid", ""),
                        optionalRobs(row, "robs")
                ));
            }

            entries = List.copyOf(parsed);
        } catch (ApiException error) {
            // Kept at fine: the board is decoration, and an outage already announces itself once
            // through the gateway rather than once per refresh here.
            logger.fine("Leaderboard refresh failed: " + error.getMessage());
        }
    }

    /** The cached board, highest first. Safe to call from the main thread. */
    public List<Entry> entries() {
        return entries;
    }

    /** The row at a one-based position, or empty when the board is shorter than that. */
    public Optional<Entry> at(int position) {
        List<Entry> snapshot = entries;
        return position >= 1 && position <= snapshot.size()
                ? Optional.of(snapshot.get(position - 1))
                : Optional.empty();
    }

    /** One player's row, matched on uuid. Empty when they are outside the fetched depth. */
    public Optional<Entry> forUuid(String uuid) {
        String wanted = uuid.toLowerCase(Locale.ROOT);
        return entries.stream().filter(entry -> entry.uuid().toLowerCase(Locale.ROOT).equals(wanted)).findFirst();
    }

    private static String optionalString(JsonObject json, String key, String fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsString();
    }

    private static int optionalInt(JsonObject json, String key, int fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsInt();
    }

    private static double optionalRobs(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull()
                ? 0d
                : org.robtic.core.util.Robs.round(element.getAsDouble());
    }
}
