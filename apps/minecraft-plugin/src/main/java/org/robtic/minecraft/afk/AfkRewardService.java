package org.robtic.minecraft.afk;

import org.robtic.minecraft.util.Robs;
import com.google.gson.JsonObject;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.cache.BalanceCache;
import org.robtic.minecraft.survival.SurvivalApi;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * What being AFK is worth, and the one write that records it.
 *
 * <h2>Nothing accrues; everything is derived</h2>
 *
 * There is no task ticking a counter and no periodic write. A session is a start timestamp held in
 * {@link AfkSnapshot}, and what it has earned at any instant is
 * {@code (now - start) / 3600000 * robs-per-hour} — a function, evaluated when somebody asks. A
 * player standing in the AFK world for six hours therefore costs this plugin nothing at all until
 * the moment they stop, at which point it costs exactly one request.
 *
 * That is also why the reward is not in the cache. Storing "robs earned so far" would create a
 * second number that has to be kept in step with the clock, which is the thing a timer would exist
 * to do; deriving it means there is nothing to keep in step.
 *
 * <h2>The totals are cached, the session is not</h2>
 *
 * Lifetime and daily figures come from the API on join, move forward locally when a session is
 * settled, and are re-read from the settlement's own response. Everything that renders them — the
 * profile GUI, the placeholders — reads this map and never the network, which is what lets a tab
 * list ask for {@code %robtic_afk_total%} once a second.
 */
public final class AfkRewardService {

    private static final double MILLIS_PER_HOUR = 3_600_000d;

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final SurvivalApi api;
    private final BalanceCache balances;
    private final Supplier<AfkSettings> settings;

    /** Per-player totals, as this server currently believes them. Read on the tick, so no I/O. */
    private final Map<UUID, AfkStatistics> statistics = new ConcurrentHashMap<>();

    public AfkRewardService(
            Plugin plugin,
            ApiGateway gateway,
            SurvivalApi api,
            BalanceCache balances,
            Supplier<AfkSettings> settings
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.balances = balances;
        this.settings = settings;
    }

    /** The cached totals, or zeroes when the join seed has not arrived. Safe on the tick. */
    public AfkStatistics statistics(UUID uuid) {
        return statistics.getOrDefault(uuid, AfkStatistics.EMPTY);
    }

    /** Seeds the totals from the join response. */
    public void seed(UUID uuid, AfkStatistics authoritative) {
        statistics.put(uuid, authoritative);
    }

    /**
     * Drops a departed player's totals.
     *
     * Unconditional now. It used to keep a rounding residue back, because that fraction was the one
     * thing here the API did not know about and dropping it rounded a player's earnings down. With
     * decimal robs there is no residue: every figure in this map is the API's, is re-read on the next
     * join, and holding a stale copy could only ever risk showing one.
     */
    public void forget(UUID uuid) {
        statistics.remove(uuid);
    }

    /**
     * What a session running right now would pay if it ended this instant.
     *
     * For display only — the profile GUI naming the robs a player is currently accruing. It is never
     * written anywhere and never added to a balance; only {@link #settle} pays.
     */
    public double projectedRobs(long afkMillis) {
        AfkSettings config = settings.get();

        if (!config.rewardsEnabled() || config.robsPerHour() <= 0d || afkMillis <= 0L) {
            return 0d;
        }

        return Robs.round((afkMillis / MILLIS_PER_HOUR) * config.robsPerHour());
    }

    /**
     * Settles one finished session: the time it lasted and the robs it earned, in a single request.
     *
     * <h2>Applied locally first</h2>
     *
     * The totals and the balance are moved forward here before the request is made, so a player who
     * walks back from AFK and immediately opens their profile sees the session they just finished
     * rather than the state before it. The API's reply then replaces both with the authoritative
     * figures — which is the same shape as an ore sale, and for the same reason: what the player is
     * shown must not wait on the network, and what is stored must not be decided by this server.
     *
     * <h2>The session is paid exactly what it earned</h2>
     *
     * It used to be floored to a whole number, because robs were whole numbers. That is the reason
     * this system looked broken: at the default ten robs an hour, five minutes is worth 0.83, which
     * floored to nothing — so a player went AFK, came back, and watched their balance not move. The
     * shortfall was carried in a rounding residue that worked within a session and was thrown away by
     * every restart.
     *
     * Robs now carry two decimal places, so the residue is gone and there is nothing to carry: the
     * session pays 0.83 and the player sees 0.83.
     *
     * @param immediate true during shutdown, when the scheduler is already gone. The request is put
     *                  straight on the offline queue, which {@code onDisable} then saves — the only
     *                  way a settlement can outlive a stopping server.
     */
    public void settle(UUID uuid, String username, long afkMillis, long sessionStartedAt, boolean immediate) {
        if (afkMillis <= 0L) {
            return;
        }

        AfkSettings config = settings.get();
        AfkStatistics before = statistics(uuid);

        double robs = config.rewardsEnabled() && config.robsPerHour() > 0d
                ? Robs.round((afkMillis / MILLIS_PER_HOUR) * config.robsPerHour())
                : 0d;

        statistics.put(uuid, before.plus(config.trackTotalTime() ? afkMillis : 0L, robs));

        // Credited against the economy's own cache rather than a second balance of our own, so the
        // robs a player just earned appear in /robs and %robtic_robs% straight away — and are
        // dropped rather than double-counted when the API's authoritative figure arrives below.
        if (Robs.isPositive(robs)) {
            balances.addPending(uuid, robs);
        }

        JsonObject body = api.afkSessionBody(uuid, username, afkMillis, robs, sessionStartedAt);
        String requestId = SurvivalApi.afkRequestId(uuid, sessionStartedAt);

        if (immediate) {
            // No scheduler during disable, and no later chance to try: queued directly, saved by
            // onDisable, replayed on the next start under the session's own key.
            gateway.queue().enqueue("/api/survival/afk", body, requestId);
            return;
        }

        gateway.submit("/api/survival/afk", body, requestId,
                response -> reconcile(uuid, response),
                error -> plugin.getLogger().fine(
                        "AFK session for " + username + " will be settled from the queue: " + error.getMessage()));
    }

    /** Replaces the local figures with the API's, which already include the session just sent. */
    private void reconcile(UUID uuid, JsonObject response) {
        if (response.has("afk") && response.get("afk").isJsonObject()) {
            JsonObject afk = response.getAsJsonObject("afk");

            statistics.computeIfPresent(uuid, (key, existing) -> existing.reconciledWith(
                    AfkStatistics.of(
                            longOf(afk, "totalMs"),
                            longOf(afk, "todayMs"),
                            afk.has("todayDate") && !afk.get("todayDate").isJsonNull()
                                    ? afk.get("todayDate").getAsString()
                                    : "",
                            doubleOf(afk, "robs"))));
        }

        if (response.has("balance") && !response.get("balance").isJsonNull()) {
            balances.reconcile(uuid, Robs.round(response.get("balance").getAsDouble()));
        }
    }

    private static long longOf(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsLong() : 0L;
    }

    private static double doubleOf(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? Robs.round(json.get(key).getAsDouble()) : 0d;
    }
}
