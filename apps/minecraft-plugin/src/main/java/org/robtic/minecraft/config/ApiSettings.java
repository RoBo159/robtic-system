package org.robtic.minecraft.config;

import org.bukkit.configuration.file.FileConfiguration;

/**
 * `api.yml` — how to reach the Robtic API and who this server claims to be.
 *
 * The values are read through accessors on every request rather than captured once, which is what
 * lets an operator rotate the key by editing the file and running `/robtic reload` without
 * restarting the Minecraft server.
 *
 * There are no database credentials here, and there is no `.env`: the plugin has no database
 * access of any kind, and the API key is the only secret it holds.
 */
public final class ApiSettings {

    private final String baseUrl;
    private final String apiKey;
    private final String guildId;

    private final String serverId;
    private final String serverName;
    private final String serverType;

    private final long connectTimeoutMillis;
    private final long requestTimeoutMillis;
    private final long retryIntervalTicks;
    private final long cacheRefreshTicks;
    private final long heartbeatTicks;
    private final long pollTicks;
    private final long placeholderRefreshTicks;

    private final boolean failOpen;
    private final boolean serveCachedBalances;
    private final boolean allowOfflineExchange;
    private final boolean allowOfflineDebit;
    private final long profileCacheMillis;
    private final long offlineMaxAgeMillis;

    ApiSettings(FileConfiguration api, FileConfiguration config) {
        // A trailing slash would produce a double slash in every path, which some proxies reject.
        String url = api.getString("api.url", "http://localhost:3002").trim();
        this.baseUrl = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;

        this.apiKey = api.getString("api.api-key", "").trim();
        this.guildId = api.getString("api.guild-id", config.getString("discord.guild-id", "")).trim();

        // Lowercased, not merely trimmed. A server id is lowercase by definition — the API's
        // pattern rejects anything else outright, and the Discord command that issues a key
        // lowercases what the operator types. Sending config.yml verbatim therefore turned
        // `id: Survival` into a request the API refused as malformed, next to a key bound to
        // `survival` that would have matched perfectly. The casing carries no meaning, so it is
        // normalised here rather than left as a trap.
        this.serverId = config.getString("server.id", "survival").trim().toLowerCase(java.util.Locale.ROOT);
        this.serverName = config.getString("server.name", "Survival").trim();
        this.serverType = config.getString("server.type", "survival").trim();

        this.connectTimeoutMillis = Math.max(1000L, api.getLong("api.connect-timeout-ms", 5000L));
        this.requestTimeoutMillis = Math.max(1000L, api.getLong("api.request-timeout-ms", 10_000L));
        this.retryIntervalTicks = Math.max(20L, api.getLong("api.retry-interval-ticks", 200L));
        this.cacheRefreshTicks = Math.max(100L, api.getLong("api.cache-refresh-ticks", 6000L));
        this.heartbeatTicks = Math.max(100L, api.getLong("api.heartbeat-ticks", 600L));
        this.pollTicks = Math.max(20L, api.getLong("api.poll-ticks", 40L));
        this.placeholderRefreshTicks = Math.max(100L, api.getLong("api.placeholder-refresh-ticks", 600L));

        this.failOpen = api.getBoolean("api.fail-open", true);

        this.serveCachedBalances = api.getBoolean("offline.serve-cached-balances", true);
        this.allowOfflineExchange = api.getBoolean("offline.allow-exchange", true);
        this.allowOfflineDebit = api.getBoolean("offline.allow-debit", false);
        this.profileCacheMillis = Math.max(5_000L, api.getLong("offline.profile-cache-ms", 60_000L));
        this.offlineMaxAgeMillis = Math.max(60_000L, api.getLong("offline.max-cache-age-ms", 86_400_000L));
    }

    /** True once the operator has filled in both the URL and a key. */
    public boolean isConfigured() {
        return !baseUrl.isBlank() && !apiKey.isBlank() && !apiKey.equals("REPLACE_ME") && !guildId.isBlank();
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String apiKey() {
        return apiKey;
    }

    public String guildId() {
        return guildId;
    }

    public String serverId() {
        return serverId;
    }

    public String serverName() {
        return serverName;
    }

    public String serverType() {
        return serverType;
    }

    public long connectTimeoutMillis() {
        return connectTimeoutMillis;
    }

    public long requestTimeoutMillis() {
        return requestTimeoutMillis;
    }

    /** How often a failed connection is retried and the offline queue is flushed. */
    public long retryIntervalTicks() {
        return retryIntervalTicks;
    }

    /** How often cached prices, ranks and lobbies are refreshed from the API. */
    public long cacheRefreshTicks() {
        return cacheRefreshTicks;
    }

    public long heartbeatTicks() {
        return heartbeatTicks;
    }

    /** How often events queued by Discord are drained. */
    /**
     * How often the caches that back the PlaceholderAPI values are refreshed.
     *
     * A placeholder is resolved on the main thread and cannot fetch anything, so this is what
     * decides how stale a coin count in a tab list may be. It is a per-online-player request each
     * time it runs, which is why it is a separate knob from the bridge poll rather than sharing it.
     */
    public long placeholderRefreshTicks() {
        return placeholderRefreshTicks;
    }

    public long pollTicks() {
        return pollTicks;
    }

    /**
     * Whether gameplay continues when the API is unreachable.
     *
     * Open by default: a network problem should not stop people playing. The economy still refuses
     * to act on a stale balance either way — that is not negotiable and is enforced separately.
     */
    public boolean failOpen() {
        return failOpen;
    }

    /** Whether a cached balance is shown when the API cannot be reached. */
    public boolean serveCachedBalances() {
        return serveCachedBalances;
    }

    /**
     * Whether ore can be sold while the API is down.
     *
     * Safe to leave on: selling only ever *credits*, and the credit is queued under an idempotency
     * key, so the worst case is that the robs arrive a few minutes late.
     */
    public boolean allowOfflineExchange() {
        return allowOfflineExchange;
    }

    /**
     * Whether robs can be *spent* while the API is down. Off by default, and it should stay off
     * until there is a reason.
     *
     * A debit taken against a cached balance cannot be validated, so on a network running several
     * servers the same robs can be spent on each of them during one outage. Nothing in game
     * currently spends robs, so this costs nothing today — it is a door kept shut rather than a
     * feature withheld.
     */
    public boolean allowOfflineDebit() {
        return allowOfflineDebit;
    }

    /** How long a cached profile is considered fresh before a refresh is attempted. */
    public long profileCacheMillis() {
        return profileCacheMillis;
    }

    /** The age past which cached data is discarded rather than served. */
    public long offlineMaxAgeMillis() {
        return offlineMaxAgeMillis;
    }
}
