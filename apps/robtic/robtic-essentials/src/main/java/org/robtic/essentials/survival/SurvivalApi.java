package org.robtic.essentials.survival;

import com.google.gson.JsonObject;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.essentials.model.SurvivalModels.BackBudget;
import org.robtic.essentials.model.SurvivalModels.InventorySnapshot;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.essentials.model.SurvivalModels.Friends;
import org.robtic.essentials.model.SurvivalModels.Homes;
import org.robtic.essentials.model.SurvivalModels.LockedChests;
import org.robtic.essentials.model.SurvivalModels.PlayerSettings;
import org.robtic.essentials.model.SurvivalModels.Profile;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Every `/api/survival/*` call, in one place.
 *
 * This is the only class in the survival feature set that knows a route string exists. The services
 * above it deal in records, and the cache in front of them decides whether a call happens at all —
 * which is what keeps "when do we talk to the API?" a question with one answer per feature rather
 * than one per command.
 *
 * Every method here performs blocking network I/O and must run off the main thread. Callers reach
 * them through {@link ApiGateway#read}, which handles that and hands the result back on the tick.
 */
public final class SurvivalApi {

    private final ApiClient client;
    private final ApiSettings settings;

    public SurvivalApi(ApiClient client, ApiSettings settings) {
        this.client = client;
        this.settings = settings;
    }

    // ─── Spawn ────────────────────────────────────────────────────────────────────────────────

    /** The server's spawn, or empty when none has been set yet. */
    public Optional<StoredLocation> spawn() {
        JsonObject response = client.get("/api/survival/spawn", base());
        return response.has("location") && !response.get("location").isJsonNull()
                ? Optional.of(StoredLocation.fromJson(response.getAsJsonObject("location")))
                : Optional.empty();
    }

    public StoredLocation setSpawn(UUID uuid, String username, StoredLocation location) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.add("location", location.toJson());

        JsonObject response = post("/api/survival/spawn", body, "setspawn", uuid);
        return StoredLocation.fromJson(response.getAsJsonObject("location"));
    }

    // ─── Homes ────────────────────────────────────────────────────────────────────────────────

    public Homes homes(UUID uuid) {
        return Homes.fromJson(client.get("/api/survival/homes", withUuid(uuid)));
    }

    public Homes setHome(UUID uuid, String username, String name, StoredLocation location) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.addProperty("name", name);
        body.add("location", location.toJson());

        return Homes.fromJson(post("/api/survival/homes/set", body, "sethome", uuid));
    }

    public Homes deleteHome(UUID uuid, String name) {
        JsonObject body = body(uuid);
        body.addProperty("name", name);

        return Homes.fromJson(post("/api/survival/homes/delete", body, "delhome", uuid));
    }

    public Homes renameHome(UUID uuid, String from, String to) {
        JsonObject body = body(uuid);
        body.addProperty("from", from);
        body.addProperty("to", to);

        return Homes.fromJson(post("/api/survival/homes/rename", body, "renamehome", uuid));
    }

    // ─── Friends ──────────────────────────────────────────────────────────────────────────────

    /** The server passes who is connected, because only it knows. */
    public Friends friends(UUID uuid, String onlineCsv) {
        Map<String, String> query = new java.util.HashMap<>(withUuid(uuid));
        query.put("online", onlineCsv);
        return Friends.fromJson(client.get("/api/survival/friends", query));
    }

    /** @return the outcome string the API decided, e.g. "requested" or "accepted". */
    public String friendAction(UUID uuid, String username, String action, UUID targetUuid, String targetUsername) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.addProperty("action", action);
        body.addProperty("targetUuid", targetUuid.toString());
        body.addProperty("targetUsername", targetUsername);

        JsonObject response = post("/api/survival/friends/action", body, "friend-" + action, uuid);
        return response.has("outcome") ? response.get("outcome").getAsString() : "unknown";
    }

    // ─── Back ─────────────────────────────────────────────────────────────────────────────────

    public BackBudget backBudget(UUID uuid) {
        return BackBudget.fromJson(client.get("/api/survival/back", withUuid(uuid)));
    }

    public BackBudget spendBack(UUID uuid, String username) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        return BackBudget.fromJson(post("/api/survival/back/spend", body, "back", uuid));
    }

    // ─── Chests ───────────────────────────────────────────────────────────────────────────────

    public LockedChests locks(UUID uuid) {
        return LockedChests.fromJson(client.get("/api/survival/chests/locks", withUuid(uuid)));
    }

    /** The lock on one block. Used by the protection listener through its own cache. */
    public Optional<String> lockOwnerAt(StoredLocation location) {
        Map<String, String> query = new java.util.HashMap<>(base());
        query.put("world", location.world());
        query.put("x", String.valueOf((long) Math.floor(location.x())));
        query.put("y", String.valueOf((long) Math.floor(location.y())));
        query.put("z", String.valueOf((long) Math.floor(location.z())));

        JsonObject response = client.get("/api/survival/chests/at", query);

        return response.has("locked") && response.get("locked").getAsBoolean()
                ? Optional.ofNullable(response.has("ownerUsername") && !response.get("ownerUsername").isJsonNull()
                        ? response.get("ownerUsername").getAsString()
                        : "someone")
                : Optional.empty();
    }

    /** @return the raw response so the caller can read `applied` and `reason`. */
    public JsonObject lock(UUID uuid, String username, StoredLocation location) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.add("location", location.toJson());
        return post("/api/survival/chests/lock", body, "lock", uuid);
    }

    public JsonObject unlock(UUID uuid, StoredLocation location) {
        JsonObject body = body(uuid);
        body.add("location", location.toJson());
        return post("/api/survival/chests/unlock", body, "unlock", uuid);
    }

    public Optional<StoredLocation> portableChest(UUID uuid) {
        JsonObject response = client.get("/api/survival/chests/portable", withUuid(uuid));
        return response.has("location") && !response.get("location").isJsonNull()
                ? Optional.of(StoredLocation.fromJson(response.getAsJsonObject("location")))
                : Optional.empty();
    }

    public StoredLocation linkChest(UUID uuid, StoredLocation location) {
        JsonObject body = body(uuid);
        body.add("location", location.toJson());

        JsonObject response = post("/api/survival/chests/portable/link", body, "linkchest", uuid);
        return StoredLocation.fromJson(response.getAsJsonObject("location"));
    }

    // ─── Player settings ──────────────────────────────────────────────────────────────────────

    public PlayerSettings settings(UUID uuid) {
        return PlayerSettings.fromJson(client.get("/api/survival/settings", withUuid(uuid)));
    }

    /**
     * Applies a partial settings change.
     *
     * A key is only sent when the caller supplied it, and JSON null is what *clears* a value —
     * which is why `/particle off` sends an explicit null rather than omitting the field.
     */
    public PlayerSettings updateSettings(UUID uuid, JsonObject changes) {
        JsonObject body = body(uuid);
        for (String key : changes.keySet()) {
            body.add(key, changes.get(key));
        }
        return PlayerSettings.fromJson(post("/api/survival/settings/set", body, "settings", uuid));
    }

    // ─── Survival inventory preview ───────────────────────────────────────────────────────────

    public InventorySnapshot inventorySnapshot(UUID uuid) {
        return InventorySnapshot.fromJson(client.get("/api/survival/inventory-snapshot", withUuid(uuid)));
    }

    /**
     * Captures a survival inventory for the lobby preview.
     *
     * Read-only by contract: nothing ever restores from this. Multiverse-Inventories owns moving
     * inventories between worlds, and this exists solely so the lobby can *show* one.
     */
    public void putInventorySnapshot(UUID uuid, String world, String contents, String armor, String offhand) {
        JsonObject body = body(uuid);
        body.addProperty("world", world);
        body.addProperty("contents", contents);
        body.addProperty("armor", armor);
        body.addProperty("offhand", offhand);

        post("/api/survival/inventory-snapshot", body, "snapshot", uuid);
    }

    // ─── Premium, profile and statistics ──────────────────────────────────────────────────────

    public Entitlements entitlements(UUID uuid) {
        return Entitlements.fromJson(client.get("/api/survival/entitlements", withUuid(uuid)));
    }

    public Profile profile(UUID uuid, boolean online) {
        Map<String, String> query = new java.util.HashMap<>(withUuid(uuid));
        query.put("online", String.valueOf(online));
        return Profile.fromJson(client.get("/api/survival/profile", query));
    }

    /** Session activity, reported as deltas so two servers cannot overwrite each other's totals. */
    public void reportStats(UUID uuid, String username, long playtimeMs, int kills, int deaths) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.addProperty("playtimeMs", playtimeMs);
        body.addProperty("kills", kills);
        body.addProperty("deaths", deaths);

        post("/api/survival/stats", body, "stats", uuid);
    }

    /**
     * Builds the one request a finished AFK session produces.
     *
     * Returned rather than sent, because the caller decides how it travels: a player who walked back
     * from AFK is still here and the reply is worth having, while a player who disconnected is not
     * and the write only has to survive. Both paths send this exact body, so there is one definition
     * of what a session report is.
     *
     * <h2>The request id identifies the session, not the moment</h2>
     *
     * Every other write here keys on {@code System.nanoTime()} so two deliberate identical actions
     * both apply. A session is the opposite case: it is settled exactly once, and the queue may well
     * replay the write after an outage. Keying on the session's own start timestamp means a replay
     * carries the same key the first attempt did and the API recognises it — so an outage during a
     * disconnect costs latency rather than paying the player twice for the same minutes.
     */
    public JsonObject afkSessionBody(UUID uuid, String username, long afkMillis, double robs, long sessionStartedAt) {
        JsonObject body = body(uuid);
        body.addProperty("username", username);
        body.addProperty("afkMs", afkMillis);
        body.addProperty("robs", org.robtic.core.util.Robs.round(robs));
        body.addProperty("requestId", afkRequestId(uuid, sessionStartedAt));
        return body;
    }

    /** The idempotency key for one AFK session. Stable across every retry and replay of it. */
    public static String afkRequestId(UUID uuid, long sessionStartedAt) {
        return ApiGateway.requestIdFor("afk", uuid, sessionStartedAt);
    }

    /** Sends a session report and returns the totals after it. Must run off the main thread. */
    public JsonObject reportAfkSession(JsonObject body) {
        return client.post("/api/survival/afk", body, body.get("requestId").getAsString());
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private Map<String, String> base() {
        return Map.of("guildId", settings.guildId(), "serverId", settings.serverId());
    }

    private Map<String, String> withUuid(UUID uuid) {
        return Map.of("guildId", settings.guildId(), "serverId", settings.serverId(), "uuid", uuid.toString());
    }

    private JsonObject body(UUID uuid) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", settings.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("serverId", settings.serverId());
        body.addProperty("serverName", settings.serverName());
        return body;
    }

    /**
     * Posts with an idempotency key derived from the action and the moment.
     *
     * Time-based rather than content-based on purpose: two deliberate identical actions — setting
     * the same home twice, sending the same friend request again — must both be applied, unlike a
     * queued replay, which carries its original key and is recognised as the duplicate it is.
     */
    private JsonObject post(String path, JsonObject body, String action, UUID uuid) {
        String requestId = ApiGateway.requestIdFor(action, uuid, System.nanoTime());
        body.addProperty("requestId", requestId);
        return client.post(path, body, requestId);
    }
}
