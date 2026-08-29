package org.robtic.essentials.model;

import org.robtic.core.entitlement.Entitlements;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The survival feature set's value types, and the JSON they are parsed from.
 *
 * One file because every record here is a small, immutable projection of one API response, and
 * they share the same handful of parsing helpers. Splitting them into a dozen files would spread
 * that shared parsing around rather than reusing it.
 *
 * Nothing here touches the network or the server tick — these are plain values, safe to hold in a
 * cache and read from any thread.
 */
public final class SurvivalModels {

    private SurvivalModels() {
    }

    // ─── Location ─────────────────────────────────────────────────────────────────────────────

    /**
     * A stored position, kept world-name-first rather than as a Bukkit {@link Location}.
     *
     * A Location holds a live World reference, which pins the world object and is null on a server
     * where that world is not loaded. Storing the name means a home in an unloaded world is a
     * message the player can act on rather than a NullPointerException.
     */
    public record StoredLocation(String world, double x, double y, double z, float yaw, float pitch) {

        public static StoredLocation of(Location location) {
            return new StoredLocation(
                    location.getWorld().getName(),
                    location.getX(), location.getY(), location.getZ(),
                    location.getYaw(), location.getPitch());
        }

        public static StoredLocation fromJson(JsonObject json) {
            return new StoredLocation(
                    json.get("world").getAsString(),
                    json.get("x").getAsDouble(),
                    json.get("y").getAsDouble(),
                    json.get("z").getAsDouble(),
                    json.has("yaw") ? json.get("yaw").getAsFloat() : 0f,
                    json.has("pitch") ? json.get("pitch").getAsFloat() : 0f);
        }

        public JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("world", world);
            json.addProperty("x", x);
            json.addProperty("y", y);
            json.addProperty("z", z);
            json.addProperty("yaw", yaw);
            json.addProperty("pitch", pitch);
            return json;
        }

        /** The live Bukkit location, or empty when that world is not loaded on this server. */
        public java.util.Optional<Location> toBukkit() {
            World loaded = Bukkit.getWorld(world);
            return loaded == null
                    ? java.util.Optional.empty()
                    : java.util.Optional.of(new Location(loaded, x, y, z, yaw, pitch));
        }
    }

    // ─── Homes ────────────────────────────────────────────────────────────────────────────────

    public record Home(String name, StoredLocation location) {
    }

    /** The whole home list plus the limit, cached together so neither can be read without the other. */
    public record Homes(List<Home> homes, int limit, String tierName) {

        public java.util.Optional<Home> byName(String name) {
            String wanted = name.toLowerCase(java.util.Locale.ROOT);
            return homes.stream().filter(home -> home.name().equals(wanted)).findFirst();
        }

        public int used() {
            return homes.size();
        }

        public boolean atLimit() {
            return homes.size() >= limit;
        }

        public static Homes fromJson(JsonObject json) {
            List<Home> parsed = new ArrayList<>();

            for (JsonElement element : array(json, "homes")) {
                JsonObject home = element.getAsJsonObject();
                parsed.add(new Home(
                        home.get("name").getAsString(),
                        StoredLocation.fromJson(home.getAsJsonObject("location"))));
            }

            return new Homes(List.copyOf(parsed), optionalInt(json, "limit", 0), optionalString(json, "tierName", null));
        }
    }

    // ─── Friends ──────────────────────────────────────────────────────────────────────────────

    public record Friend(UUID uuid, String username, boolean online, String premiumTier, Long lastSeenAt) {
    }

    public record FriendRequest(UUID uuid, String username) {
    }

    public record Friends(List<Friend> friends, List<FriendRequest> incoming, List<FriendRequest> outgoing, boolean autoAcceptTp) {

        public static Friends empty() {
            return new Friends(List.of(), List.of(), List.of(), false);
        }

        public boolean isFriend(UUID uuid) {
            return friends.stream().anyMatch(friend -> friend.uuid().equals(uuid));
        }

        public static Friends fromJson(JsonObject json) {
            List<Friend> friends = new ArrayList<>();
            for (JsonElement element : array(json, "friends")) {
                JsonObject friend = element.getAsJsonObject();
                friends.add(new Friend(
                        UUID.fromString(friend.get("uuid").getAsString()),
                        optionalString(friend, "username", "unknown"),
                        optionalBoolean(friend, "online"),
                        optionalString(friend, "premiumTier", null),
                        parseInstant(friend, "lastSeenAt")));
            }

            return new Friends(
                    List.copyOf(friends),
                    requests(json, "incoming"),
                    requests(json, "outgoing"),
                    optionalBoolean(json, "autoAcceptTp"));
        }

        private static List<FriendRequest> requests(JsonObject json, String key) {
            List<FriendRequest> parsed = new ArrayList<>();
            for (JsonElement element : array(json, key)) {
                JsonObject request = element.getAsJsonObject();
                parsed.add(new FriendRequest(
                        UUID.fromString(request.get("uuid").getAsString()),
                        optionalString(request, "username", "unknown")));
            }
            return List.copyOf(parsed);
        }
    }

    // ─── Back ─────────────────────────────────────────────────────────────────────────────────

    /**
     * The `/back` budget.
     *
     * Carries `resetAt` rather than only a count, which is what lets the plugin decrement locally
     * and know when it is worth asking again — without it, an exhausted budget would have to poll.
     */
    public record BackBudget(int remaining, int limit, long resetAtMillis, boolean allowed) {

        public static BackBudget denied() {
            return new BackBudget(0, 0, 0L, false);
        }

        public boolean hasRemaining() {
            return allowed && remaining > 0;
        }

        /** True once the window has elapsed, at which point the cached figure is worthless. */
        public boolean windowElapsed() {
            return System.currentTimeMillis() >= resetAtMillis;
        }

        /** The budget after spending one locally, mirroring what the API just recorded. */
        public BackBudget spendOne() {
            return new BackBudget(Math.max(0, remaining - 1), limit, resetAtMillis, allowed);
        }

        public static BackBudget fromJson(JsonObject json) {
            Long resetAt = parseInstant(json, "resetAt");
            return new BackBudget(
                    optionalInt(json, "remaining", 0),
                    optionalInt(json, "limit", 0),
                    resetAt == null ? 0L : resetAt,
                    optionalBoolean(json, "allowed"));
        }
    }

    // ─── Chests ───────────────────────────────────────────────────────────────────────────────

    public record LockedChests(List<StoredLocation> chests, int limit) {

        public static LockedChests empty() {
            return new LockedChests(List.of(), 0);
        }

        public static LockedChests fromJson(JsonObject json) {
            List<StoredLocation> parsed = new ArrayList<>();
            for (JsonElement element : array(json, "chests")) {
                parsed.add(StoredLocation.fromJson(element.getAsJsonObject().getAsJsonObject("location")));
            }
            return new LockedChests(List.copyOf(parsed), optionalInt(json, "limit", 0));
        }
    }

    // ─── Player settings ──────────────────────────────────────────────────────────────────────

    /**
     * Every preference a player owns, in one record.
     *
     * The lobby, the friend system and the cosmetics all read from this — it replaced three
     * separate shapes that were each a projection of the same stored document.
     */
    public record PlayerSettings(
            boolean friendTpAutoAccept,
            boolean playersVisible,
            boolean privateProfile,
            String joinMessage,
            String leaveMessage,
            String particle,
            boolean cosmeticsAllowed
    ) {
        /** Defaults for a player whose settings have not loaded yet. Visible, manual approval. */
        public static PlayerSettings defaults() {
            return new PlayerSettings(false, true, false, null, null, null, false);
        }

        public PlayerSettings withPlayersVisible(boolean visible) {
            return new PlayerSettings(friendTpAutoAccept, visible, privateProfile,
                    joinMessage, leaveMessage, particle, cosmeticsAllowed);
        }

        public static PlayerSettings fromJson(JsonObject json) {
            return new PlayerSettings(
                    optionalBoolean(json, "friendTpAutoAccept"),
                    !json.has("playersVisible") || json.get("playersVisible").getAsBoolean(),
                    optionalBoolean(json, "privateProfile"),
                    optionalString(json, "joinMessage", null),
                    optionalString(json, "leaveMessage", null),
                    optionalString(json, "particle", null),
                    optionalBoolean(json, "cosmeticsAllowed"));
        }
    }

    /** The read-only survival inventory the lobby previews. Never restored — the API owns that. */
    public record InventorySnapshot(String world, String contents, String armor, String offhand, Long capturedAt) {

        public static InventorySnapshot empty() {
            return new InventorySnapshot(null, "", "", "", null);
        }

        public boolean isEmpty() {
            return contents == null || contents.isBlank();
        }

        public static InventorySnapshot fromJson(JsonObject json) {
            return new InventorySnapshot(
                    optionalString(json, "world", null),
                    optionalString(json, "contents", ""),
                    optionalString(json, "armor", ""),
                    optionalString(json, "offhand", ""),
                    parseInstant(json, "capturedAt"));
        }
    }

    // ─── Profile ──────────────────────────────────────────────────────────────────────────────

    /** The aggregate behind `/profile`. Deliberately carries no home coordinates. */
    public record Profile(
            UUID uuid,
            String username,
            boolean online,
            boolean linked,
            String discordId,
            Entitlements premium,
            long playtimeMs,
            Long firstJoinAt,
            Long lastSeenAt,
            long robs,
            int kills,
            int deaths,
            boolean jailed,
            Long jailRemainingMs,
            int jailCount,
            int homesUsed,
            int homeLimit,
            int friendCount,
            String rankName,
            AfkTotals afk
    ) {
        public static Profile fromJson(JsonObject json) {
            return new Profile(
                    UUID.fromString(json.get("uuid").getAsString()),
                    optionalString(json, "username", "unknown"),
                    optionalBoolean(json, "online"),
                    optionalBoolean(json, "linked"),
                    optionalString(json, "discordId", null),
                    json.has("premium") && json.get("premium").isJsonObject()
                            ? Entitlements.fromJson(json.getAsJsonObject("premium"))
                            : Entitlements.free(0),
                    optionalLong(json, "playtimeMs"),
                    parseInstant(json, "firstJoinAt"),
                    parseInstant(json, "lastSeenAt"),
                    optionalLong(json, "robs"),
                    optionalInt(json, "kills", 0),
                    optionalInt(json, "deaths", 0),
                    optionalBoolean(json, "jailed"),
                    json.has("jailRemainingMs") && !json.get("jailRemainingMs").isJsonNull()
                            ? json.get("jailRemainingMs").getAsLong()
                            : null,
                    optionalInt(json, "jailCount", 0),
                    optionalInt(json, "homesUsed", 0),
                    optionalInt(json, "homeLimit", 0),
                    optionalInt(json, "friendCount", 0),
                    optionalString(json, "rankName", null),
                    AfkTotals.fromJson(json.has("afk") && json.get("afk").isJsonObject()
                            ? json.getAsJsonObject("afk")
                            : new JsonObject()));
        }
    }

    // ─── AFK ──────────────────────────────────────────────────────────────────────────────────

    /**
     * A player's lifetime AFK figures, as the API holds them.
     *
     * The session a player is in right now is deliberately absent: it lives in the AFK service's
     * memory and is never written, so asking the API for it would return a number that is always at
     * least a session out of date. Anything rendering "current session" reads it from there and adds
     * it to these.
     *
     * @param todayDate the UTC day {@code todayMillis} describes, so a figure that has been
     *                  overtaken by midnight is recognisable as such rather than shown as today's
     */
    public record AfkTotals(long totalMillis, long todayMillis, String todayDate, long robs) {

        public static AfkTotals empty() {
            return new AfkTotals(0L, 0L, "", 0L);
        }

        /** Today's figure, or zero once the day it was recorded for has passed. */
        public long todayOrZero() {
            return java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString().equals(todayDate)
                    ? todayMillis
                    : 0L;
        }

        public static AfkTotals fromJson(JsonObject json) {
            return new AfkTotals(
                    optionalLong(json, "totalMs"),
                    optionalLong(json, "todayMs"),
                    optionalString(json, "todayDate", ""),
                    optionalLong(json, "robs"));
        }
    }

    // ─── Parsing helpers ──────────────────────────────────────────────────────────────────────

    private static JsonArray array(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element != null && element.isJsonArray() ? element.getAsJsonArray() : new JsonArray();
    }

    private static String optionalString(JsonObject json, String key, String fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsString();
    }

    private static int optionalInt(JsonObject json, String key, int fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsInt();
    }

    private static long optionalLong(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? 0L : element.getAsLong();
    }

    private static boolean optionalBoolean(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element != null && !element.isJsonNull() && element.getAsBoolean();
    }

    /** An ISO-8601 timestamp as epoch millis, or null when absent or unparseable. */
    private static Long parseInstant(JsonObject json, String key) {
        String raw = optionalString(json, key, null);
        if (raw == null) {
            return null;
        }

        try {
            return java.time.Instant.parse(raw).toEpochMilli();
        } catch (java.time.format.DateTimeParseException malformed) {
            return null;
        }
    }
}
