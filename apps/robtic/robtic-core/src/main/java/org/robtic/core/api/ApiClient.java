package org.robtic.core.api;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.robtic.core.config.ApiSettings;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The HTTP transport to the Robtic API.
 *
 * Every call is synchronous and every call must therefore run off the main server thread — the
 * same rule the old database layer had, for the same reason. Callers get that for free by going
 * through {@link ApiGateway}, which schedules the work.
 *
 * Transient failures are retried here with exponential backoff and full jitter, so a fleet of
 * servers reconnecting after an API restart does not retry in lockstep and knock it over again.
 */
public final class ApiClient {

    /** Mirrors API_RETRY in libs/sdk. */
    private static final int MAX_ATTEMPTS = 4;
    private static final long BASE_DELAY_MILLIS = 500L;
    private static final long MAX_DELAY_MILLIS = 8_000L;
    private static final int BACKOFF_FACTOR = 2;

    private final HttpClient http;

    /**
     * The <em>live</em> settings, not a snapshot of them.
     *
     * {@link ApiSettings} is immutable, and a reload does not mutate it — it builds a replacement
     * and hands it to the registry. Holding the object itself therefore pinned whichever key was
     * on disk at startup: an operator could paste a new key into api.yml, run `/robtic reload`,
     * watch it report success, and go on authenticating with the old one until the server was
     * restarted. Since the old key is usually being replaced precisely because it stopped working,
     * the result was an unbroken run of 401s that the reload appeared to have fixed.
     *
     * Reading through the registry is what the class always claimed to do.
     */
    private final Supplier<ApiSettings> settings;
    private final Logger logger;
    private final String pluginVersion;

    public ApiClient(Supplier<ApiSettings> settings, Logger logger, String pluginVersion) {
        this.settings = settings;
        this.logger = logger;
        this.pluginVersion = pluginVersion;
        // The connect timeout is fixed at construction because a JDK HttpClient cannot be
        // reconfigured. Changing it is the one setting here that still needs a restart.
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(settings.get().connectTimeoutMillis()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public JsonObject get(String path, Map<String, String> query) {
        return send("GET", path + queryString(query), null, null);
    }

    public JsonObject post(String path, JsonObject body) {
        return send("POST", path, body, null);
    }

    /** POST carrying an idempotency key, so a replayed queue entry is applied exactly once. */
    public JsonObject post(String path, JsonObject body, String requestId) {
        return send("POST", path, body, requestId);
    }

    /**
     * One call, with retries. Throws {@link ApiException} on every failure path so a caller never
     * has to distinguish an IO problem from an API-level one.
     */
    private JsonObject send(String method, String path, JsonObject body, String requestId) {
        ApiException last = new ApiException("NETWORK_UNREACHABLE", 0, "The request was never attempted");

        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (attempt > 0 && !sleep(backoffMillis(attempt - 1))) {
                // Interrupted while backing off — the server is most likely shutting down.
                throw last;
            }

            try {
                return attempt(method, path, body, requestId);
            } catch (ApiException error) {
                last = error;
                if (!error.isRetryable()) {
                    throw error;
                }
            }
        }

        throw last;
    }

    private JsonObject attempt(String method, String path, JsonObject body, String requestId) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(settings.get().baseUrl() + path))
                .timeout(Duration.ofMillis(settings.get().requestTimeoutMillis()))
                // Resolved through the registry on every request, so a key pasted into api.yml and
                // reloaded takes effect on the next call rather than on the next restart.
                .header("Authorization", "Bearer " + settings.get().apiKey())
                .header("Accept", "application/json")
                .header("X-Robtic-Server-Id", settings.get().serverId())
                .header("X-Robtic-Server-Name", settings.get().serverName())
                .header("X-Robtic-Plugin-Version", pluginVersion);

        if (requestId != null) {
            builder.header("X-Robtic-Request-Id", requestId);
        }

        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        }

        HttpResponse<String> response;
        try {
            response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new ApiException("NETWORK_UNREACHABLE", 0, "Could not reach the Robtic API: " + error.getMessage(), error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ApiException("NETWORK_UNREACHABLE", 0, "Interrupted while calling the Robtic API", error);
        }

        return unwrap(response, path);
    }

    /** Unwraps the `{ ok, data }` envelope, turning `{ ok: false }` into an {@link ApiException}. */
    private JsonObject unwrap(HttpResponse<String> response, String path) {
        JsonElement parsed;
        try {
            parsed = JsonParser.parseString(response.body());
        } catch (RuntimeException error) {
            throw new ApiException("UPSTREAM_UNAVAILABLE", response.statusCode(), notJson(response, path));
        }

        if (!parsed.isJsonObject()) {
            throw new ApiException("UPSTREAM_UNAVAILABLE", response.statusCode(), notJson(response, path));
        }

        JsonObject envelope = parsed.getAsJsonObject();

        if (envelope.has("ok") && envelope.get("ok").getAsBoolean()) {
            JsonElement data = envelope.get("data");
            if (data != null && data.isJsonObject()) {
                return data.getAsJsonObject();
            }
            // A route whose payload is an array is wrapped so callers always receive an object.
            JsonObject wrapper = new JsonObject();
            wrapper.add("data", data);
            return wrapper;
        }

        JsonObject error = envelope.has("error") && envelope.get("error").isJsonObject()
                ? envelope.getAsJsonObject("error")
                : new JsonObject();

        String code = error.has("code") ? error.get("code").getAsString() : "INTERNAL_ERROR";
        String message = error.has("message") ? error.get("message").getAsString() : "The API rejected the request";

        throw new ApiException(code, response.statusCode(), message);
    }

    /**
     * Describes a response that was not the JSON envelope, quoting what actually arrived.
     *
     * The body used to be discarded, which made this the least diagnosable failure the plugin has:
     * a reverse proxy or CDN returning its own HTML error page is reported to the player as
     * "the economy is temporarily unavailable" and leaves nothing in the console to say why, so a
     * misconfigured vhost looks identical to the API being down. Anything that is not JSON is
     * therefore logged with its status and the first line of its body — which is exactly where an
     * Nginx or Cloudflare page names itself.
     */
    private String notJson(HttpResponse<String> response, String path) {
        String body = response.body() == null ? "" : response.body().strip();
        String snippet = body.length() > 200 ? body.substring(0, 200) + "…" : body;
        String server = response.headers().firstValue("server").orElse("");

        String detail = "The API returned a non-JSON " + response.statusCode() + " response for " + path
                + (server.isBlank() ? "" : " (served by " + server + ")")
                + (snippet.isBlank() ? "" : " — body: " + snippet.replaceAll("\\s+", " "));

        // Logged as well as thrown: the caller decides what the player sees, but an operator needs
        // this once, in the console, whatever that decision is.
        logger.warning(detail + " — this is usually a reverse proxy or CDN answering instead of the "
                + "API. Check that api.url points at the API and that the proxy forwards this method "
                + "and path.");

        return detail;
    }

    /** Confirms the key and the connection. Failures are the caller's to report, not to swallow. */
    public JsonObject authenticate(String guildId) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", guildId);
        body.addProperty("serverId", settings.get().serverId());
        body.addProperty("serverName", settings.get().serverName());
        if (!settings.get().serverType().isBlank()) {
            body.addProperty("serverType", settings.get().serverType());
        }
        body.addProperty("pluginVersion", pluginVersion);

        return post("/api/plugin/auth", body);
    }

    private long backoffMillis(int attempt) {
        long ceiling = Math.min(BASE_DELAY_MILLIS * (long) Math.pow(BACKOFF_FACTOR, attempt), MAX_DELAY_MILLIS);
        return ThreadLocalRandom.current().nextLong(1, Math.max(2, ceiling));
    }

    private boolean sleep(long millis) {
        try {
            Thread.sleep(millis);
            return true;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            logger.log(Level.FINE, "Backoff interrupted", error);
            return false;
        }
    }

    private String queryString(Map<String, String> query) {
        if (query == null || query.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder("?");
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (entry.getValue() == null) {
                continue;
            }
            if (builder.length() > 1) {
                builder.append('&');
            }
            builder.append(encode(entry.getKey())).append('=').append(encode(entry.getValue()));
        }

        return builder.length() == 1 ? "" : builder.toString();
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
