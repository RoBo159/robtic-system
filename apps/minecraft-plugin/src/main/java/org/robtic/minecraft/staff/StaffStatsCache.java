package org.robtic.minecraft.staff;

import com.google.gson.JsonObject;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.config.ApiSettings;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * The report and case counters the staff placeholders read.
 *
 * <h2>Why this is a cache and not a lookup</h2>
 *
 * PlaceholderAPI resolves on the calling thread, and its callers — tab lists, scoreboards — re-render
 * for every player on a timer. A counter that queried the API would put a network call inside the
 * server tick several times a second. Everything here is therefore refreshed on a schedule and read
 * from memory, exactly as the existing balance and leaderboard placeholders are.
 *
 * <h2>Availability is not cached</h2>
 *
 * Who is online and in staff mode is this server's own state, so {@link StaffAvailabilityService}
 * answers it directly from memory with no staleness at all. Only the figures that live in the
 * database — report counts, lifetime case totals — need refreshing.
 */
public final class StaffStatsCache {

    /**
     * How often the counters are refreshed.
     *
     * Short, as the specification asks, but not per-tick: a report count that is thirty seconds out
     * of date on a scoreboard is unnoticeable, and one request per interval is the entire cost.
     */
    private static final long REFRESH_TICKS = 600L;

    private final Plugin plugin;
    private final ApiClient client;
    private final ApiSettings api;

    /** Guild-wide report counts. Replaced wholesale, so a reader never sees a half-updated set. */
    private volatile Counts counts = Counts.empty();

    /** Per-staff figures, refreshed only for players currently in staff mode. */
    private final Map<UUID, StaffCounts> perStaff = new ConcurrentHashMap<>();

    private int taskId = -1;

    public StaffStatsCache(Plugin plugin, ApiClient client, ApiSettings api) {
        this.plugin = plugin;
        this.client = client;
        this.api = api;
    }

    /** Guild-wide report totals by status. */
    public record Counts(int open, int reviewing, int resolved, int dismissed) {
        static Counts empty() {
            return new Counts(0, 0, 0, 0);
        }
    }

    /** One staff member's own tallies. */
    public record StaffCounts(int claimed, int handled, int jails, int warnings) {
        static StaffCounts empty() {
            return new StaffCounts(0, 0, 0, 0);
        }
    }

    /** Safe on the tick. */
    public Counts counts() {
        return counts;
    }

    /** Safe on the tick. Zeroes for a player whose figures have not been fetched yet. */
    public StaffCounts of(UUID uuid) {
        return perStaff.getOrDefault(uuid, StaffCounts.empty());
    }

    /**
     * Starts the refresh loop.
     *
     * One pass fetches the guild-wide counts and then each on-duty staff member's own figures. Off
     * duty staff are skipped: their numbers are only shown on their own panel, and refreshing them
     * would mean a request for somebody who is not looking.
     */
    public void start(StaffAvailabilityService availability) {
        if (taskId != -1) {
            return;
        }

        taskId = plugin.getServer().getScheduler().runTaskTimerAsynchronously(plugin, () -> {
            refreshGuildCounts();

            for (Player staff : availability.activeStaff()) {
                refreshFor(staff.getUniqueId());
            }
        }, REFRESH_TICKS, REFRESH_TICKS).getTaskId();
    }

    public void stop() {
        if (taskId != -1) {
            plugin.getServer().getScheduler().cancelTask(taskId);
            taskId = -1;
        }
    }

    /** Off-thread. Called by the refresh loop and after a claim or close, so a panel updates at once. */
    public void refreshGuildCounts() {
        try {
            JsonObject response = client.get("/api/staff/reports/counts", Map.of("guildId", api.guildId()));

            counts = new Counts(
                    optionalInt(response, "open"),
                    optionalInt(response, "reviewing"),
                    optionalInt(response, "resolved"),
                    optionalInt(response, "dismissed"));
        } catch (ApiException error) {
            // Quiet: the gateway already announces an outage once, and a stale counter on a
            // scoreboard is not worth a log line every thirty seconds.
            plugin.getLogger().log(Level.FINE, "Report counts refresh failed: " + error.getMessage());
        }
    }

    /** Off-thread. One staff member's own figures. */
    public void refreshFor(UUID uuid) {
        try {
            JsonObject response = client.get("/api/staff/reports/counts", Map.of(
                    "guildId", api.guildId(),
                    "staffUuid", uuid.toString()));

            JsonObject stats = client.get("/api/staff/stats", Map.of(
                    "guildId", api.guildId(),
                    "uuid", uuid.toString()));

            perStaff.put(uuid, new StaffCounts(
                    optionalInt(response, "claimedByStaff"),
                    optionalInt(response, "handledByStaff"),
                    optionalInt(stats, "jails"),
                    optionalInt(stats, "warningsIssued")));
        } catch (ApiException error) {
            plugin.getLogger().log(Level.FINE, "Staff counters refresh failed for " + uuid + ": " + error.getMessage());
        }
    }

    public void forget(UUID uuid) {
        perStaff.remove(uuid);
    }

    private static int optionalInt(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsInt() : 0;
    }
}
