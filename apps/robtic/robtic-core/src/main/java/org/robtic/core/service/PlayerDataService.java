package org.robtic.core.service;

import com.google.gson.JsonObject;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.cache.OfflineCache;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.model.PlayerProfile;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Resolves and caches player identity: link, Discord roles, staff eligibility, punishment flags.
 *
 * The cache is stale-tolerant. When the API cannot be reached the last known profile is returned
 * rather than an error, because the alternative during an outage is not fresher data — it is a
 * staff member who cannot open `/admin` and a linked player told they are not linked. An entry is
 * only discarded once it is old enough to be actively misleading.
 *
 * Every method here performs network I/O and must run off the main thread.
 */
public final class PlayerDataService {

    private final ApiClient client;
    private final ApiSettings settings;
    private final Logger logger;
    private final OfflineCache<UUID, PlayerProfile> cache;

    public PlayerDataService(ApiClient client, ApiSettings settings, Logger logger) {
        this.client = client;
        this.settings = settings;
        this.logger = logger;
        this.cache = new OfflineCache<>(settings.profileCacheMillis(), settings.offlineMaxAgeMillis());
    }

    /**
     * The player's profile.
     *
     * Served from cache while fresh, refreshed from the API when not, and — if that refresh fails
     * — served stale rather than thrown. Only a total miss on an unreachable API produces an
     * error, because at that point there is genuinely nothing to report.
     */
    public PlayerProfile profile(UUID uuid, String username) {
        Optional<PlayerProfile> fresh = cache.fresh(uuid);
        if (fresh.isPresent()) {
            return fresh.get();
        }

        try {
            JsonObject response = client.get("/api/minecraft/player", Map.of(
                    "guildId", settings.guildId(),
                    "uuid", uuid.toString()
            ));

            PlayerProfile profile = PlayerProfile.fromJson(response);
            cache.put(uuid, profile);
            return profile;
        } catch (ApiException error) {
            Optional<OfflineCache.Entry<PlayerProfile>> stale = cache.any(uuid);

            if (stale.isPresent()) {
                logger.fine("Serving a cached profile for " + username
                        + " (" + stale.get().ageMillis() / 1000 + "s old) — the API is unreachable.");
                return stale.get().value();
            }

            throw error;
        }
    }

    /** True when the value {@link #profile} would return is older than the freshness window. */
    public boolean isStale(UUID uuid) {
        return cache.any(uuid).map(OfflineCache.Entry::stale).orElse(true);
    }

    /** The cached profile without touching the network, for a caller that cannot block. */
    public Optional<PlayerProfile> cached(UUID uuid) {
        return cache.any(uuid).map(OfflineCache.Entry::value);
    }

    /** Issues a one-time linking code. Requires the API — a code the server invented is worthless. */
    public JsonObject issueLinkCode(UUID uuid, String username) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", settings.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("serverId", settings.serverId());

        return client.post("/api/minecraft/link", body);
    }

    /**
     * Resolves a player by name, for a staff command naming someone who is not online.
     *
     * Only ever finds a *linked* player: the API keys this lookup off the link table, and an
     * unlinked name has no uuid it could return. That is the right boundary for the callers here —
     * every one of them is about ranks or moderation, neither of which an unlinked player has.
     * Robs are deliberately not among them: they are keyed by uuid and need no link at all.
     *
     * Not cached. It is a staff action typed by hand, so the round trip is affordable and a stale
     * answer would be worse than a slow one.
     */
    public PlayerProfile profileByUsername(String username) {
        return PlayerProfile.fromJson(client.get("/api/minecraft/player", Map.of(
                "guildId", settings.guildId(),
                "username", username
        )));
    }

    /** Forces the next read to hit the API. */
    public void invalidate(UUID uuid) {
        cache.invalidate(uuid);
    }

    public void invalidateAll() {
        cache.clear();
    }

    /** Cached players, so a reconnect can refresh them in one pass. */
    public java.util.Set<UUID> cachedPlayers() {
        return cache.keys();
    }
}
