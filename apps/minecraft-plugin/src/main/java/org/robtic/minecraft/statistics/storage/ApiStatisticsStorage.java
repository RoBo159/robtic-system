package org.robtic.minecraft.statistics.storage;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;

import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Statistics persisted through the Robtic API, which is where the rest of this plugin's player data
 * lives.
 *
 * <h2>Routes</h2>
 *
 * <pre>
 *   GET  /api/statistics/player   ?guildId&amp;serverId&amp;uuid
 *   POST /api/statistics/player   {guildId, serverId, uuid, statistics}
 * </pre>
 *
 * The body is exactly what {@link StatisticsCodec} produces, version field included — so the API
 * stores an opaque document and a schema change needs no server-side deployment to accompany it.
 * That is deliberate: statistics will gain fields far more often than the API can be redeployed.
 *
 * <h2>Idempotency keys</h2>
 *
 * A save keys on the player and the moment. Two saves a second apart are two genuine states and both
 * should land — unlike a workspace claim, which is a once-ever event that must be recognised as a
 * duplicate if the write queue replays it. Statistics are last-write-wins by nature.
 *
 * <h2>Until the endpoints exist</h2>
 *
 * A 404 is reported as a {@link StorageException} like any other failure, so the repository refuses
 * to save and the operator sees one clear warning. That is the intended behaviour of running this
 * backend against an API that has not been updated yet, and it is why {@link FileStatisticsStorage}
 * is the default.
 */
public final class ApiStatisticsStorage implements StatisticsStorage {

    private final ApiClient client;
    private final Supplier<ApiSettings> settings;

    public ApiStatisticsStorage(ApiClient client, Supplier<ApiSettings> settings) {
        this.client = client;
        this.settings = settings;
    }

    @Override
    public String describe() {
        return "Robtic API";
    }

    @Override
    public PlayerStatistics load(UUID playerId) throws StorageException {
        try {
            ApiSettings current = settings.get();

            JsonObject response = client.get("/api/statistics/player", Map.of(
                    "guildId", current.guildId(),
                    "serverId", current.serverId(),
                    "uuid", playerId.toString()));

            JsonElement statistics = response.get("statistics");

            // A player the API has never heard of comes back without a body rather than as an error,
            // and must decode to an empty record — see FileStatisticsStorage#load for why that
            // distinction decides whether new players can record anything at all.
            return statistics != null && statistics.isJsonObject()
                    ? StatisticsCodec.decode(statistics.getAsJsonObject())
                    : PlayerStatistics.empty();
        } catch (ApiException failure) {
            throw new StorageException("The API could not return statistics for " + playerId
                    + ": " + failure.getMessage(), failure);
        }
    }

    @Override
    public void save(UUID playerId, PlayerStatistics statistics) throws StorageException {
        ApiSettings current = settings.get();

        JsonObject body = new JsonObject();
        body.addProperty("guildId", current.guildId());
        body.addProperty("serverId", current.serverId());
        body.addProperty("serverName", current.serverName());
        body.addProperty("uuid", playerId.toString());
        body.add("statistics", StatisticsCodec.encode(statistics));

        try {
            client.post("/api/statistics/player", body,
                    ApiGateway.requestIdFor("statistics-save", playerId, System.currentTimeMillis()));
        } catch (ApiException failure) {
            throw new StorageException("The API rejected a statistics save for " + playerId
                    + ": " + failure.getMessage(), failure);
        }
    }
}
