package org.robtic.jobs.storage;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.robtic.core.api.ApiClient;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.jobs.workspace.Workspace;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Progression persisted through the Robtic API, which is where the rest of this plugin's player data
 * lives.
 *
 * <h2>Routes</h2>
 *
 * <pre>
 *   GET  /api/progression/player      ?guildId&serverId&uuid
 *   POST /api/progression/player      {guildId, serverId, uuid, progression}
 *   GET  /api/progression/workspaces  ?guildId&serverId
 *   POST /api/progression/workspaces  {guildId, serverId, workspace}
 *   POST /api/progression/workspaces/delete {guildId, serverId, workspaceId}
 * </pre>
 *
 * Delete is a POST rather than a DELETE because {@link ApiClient} exposes GET and POST only, and
 * adding a verb to the shared client for one call would change the queueing and retry behaviour that
 * every other feature depends on. The route name says what it does.
 *
 * <h2>Idempotency keys</h2>
 *
 * A player save keys on the player and the moment, because two saves a second apart are two genuine
 * states and both should land. A workspace claim keys on the workspace id alone, because a claim is
 * a once-ever event that the write queue may replay after an outage — and a replayed claim that the
 * API cannot recognise as a duplicate is exactly how one structure ends up claimed twice.
 *
 * <h2>Until the endpoints exist</h2>
 *
 * A 404 is reported as a {@link StorageException} like any other failure, which means the repository
 * refuses to save and the operator sees one clear warning. That is the intended behaviour of running
 * this backend against an API that has not been updated yet — and it is why
 * {@link FileProgressionStorage} exists as the default until they are deployed.
 */
public final class ApiProgressionStorage implements ProgressionStorage {

    private final ApiClient client;
    private final Supplier<ApiSettings> settings;

    public ApiProgressionStorage(ApiClient client, Supplier<ApiSettings> settings) {
        this.client = client;
        this.settings = settings;
    }

    @Override
    public String describe() {
        return "Robtic API";
    }

    @Override
    public PlayerProgression load(UUID playerId) throws StorageException {
        try {
            JsonObject response = client.get("/api/progression/player", withUuid(playerId));

            // A player the API has never heard of comes back without a body rather than as an error,
            // and must decode to EMPTY — see FileProgressionStorage#load for why that distinction
            // decides whether new players can progress at all.
            JsonElement progression = response.get("progression");

            return progression != null && progression.isJsonObject()
                    ? ProgressionCodec.decode(progression.getAsJsonObject())
                    : PlayerProgression.EMPTY;
        } catch (ApiException failure) {
            throw new StorageException("The API could not return progression for " + playerId
                    + ": " + failure.getMessage(), failure);
        }
    }

    @Override
    public void save(UUID playerId, PlayerProgression progression) throws StorageException {
        JsonObject body = body();
        body.addProperty("uuid", playerId.toString());
        body.add("progression", ProgressionCodec.encode(progression));

        try {
            client.post("/api/progression/player", body,
                    ApiGateway.requestIdFor("progression-save", playerId, System.currentTimeMillis()));
        } catch (ApiException failure) {
            throw new StorageException("The API rejected a progression save for " + playerId
                    + ": " + failure.getMessage(), failure);
        }
    }

    @Override
    public List<Workspace> loadWorkspaces() throws StorageException {
        try {
            JsonObject response = client.get("/api/progression/workspaces", base());
            JsonElement element = response.get("workspaces");

            if (element == null || !element.isJsonArray()) {
                return List.of();
            }

            JsonArray array = element.getAsJsonArray();
            List<Workspace> workspaces = new ArrayList<>(array.size());

            for (JsonElement entry : array) {
                if (entry.isJsonObject()) {
                    Workspace.fromJson(entry.getAsJsonObject()).ifPresent(workspaces::add);
                }
            }

            return workspaces;
        } catch (ApiException failure) {
            throw new StorageException("The API could not return workspaces: "
                    + failure.getMessage(), failure);
        }
    }

    @Override
    public void saveWorkspace(Workspace workspace) throws StorageException {
        JsonObject body = body();
        body.add("workspace", workspace.toJson());

        try {
            // Keyed on the workspace id alone: a replayed claim must be recognised as the same claim.
            client.post("/api/progression/workspaces", body,
                    ApiGateway.requestIdFor("workspace", workspace.id()));
        } catch (ApiException failure) {
            throw new StorageException("The API rejected a workspace save: "
                    + failure.getMessage(), failure);
        }
    }

    @Override
    public void deleteWorkspace(String workspaceId) throws StorageException {
        JsonObject body = body();
        body.addProperty("workspaceId", workspaceId);

        try {
            client.post("/api/progression/workspaces/delete", body,
                    ApiGateway.requestIdFor("workspace-delete", workspaceId));
        } catch (ApiException failure) {
            throw new StorageException("The API rejected a workspace delete: "
                    + failure.getMessage(), failure);
        }
    }

    private Map<String, String> base() {
        ApiSettings current = settings.get();
        return Map.of("guildId", current.guildId(), "serverId", current.serverId());
    }

    private Map<String, String> withUuid(UUID uuid) {
        ApiSettings current = settings.get();
        return Map.of(
                "guildId", current.guildId(),
                "serverId", current.serverId(),
                "uuid", uuid.toString());
    }

    private JsonObject body() {
        ApiSettings current = settings.get();

        JsonObject body = new JsonObject();
        body.addProperty("guildId", current.guildId());
        body.addProperty("serverId", current.serverId());
        body.addProperty("serverName", current.serverName());
        return body;
    }
}
