package org.robtic.minecraft.api;

import com.google.gson.JsonObject;
import org.bukkit.plugin.Plugin;
import org.bukkit.scheduler.BukkitScheduler;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The plugin's single door to the Robtic API.
 *
 * Three responsibilities, all of which exist so no caller has to think about them:
 *
 * <ul>
 *   <li><b>Threading.</b> Every HTTP call runs on a worker; every callback is handed back on the
 *       main thread. Nothing in this plugin may block the server tick on a network call.</li>
 *   <li><b>Availability.</b> The gateway tracks whether the API is reachable, so features that
 *       need it can degrade rather than fail loudly on every interaction.</li>
 *   <li><b>Durability.</b> A write that fails because the API is down is queued and replayed, so
 *       an outage costs latency rather than data.</li>
 * </ul>
 */
public final class ApiGateway {

    private final Plugin plugin;
    private final BukkitScheduler scheduler;
    private final ApiClient client;
    private final RequestQueue queue;
    private final Logger logger;

    /** Reflects the last observed reachability, used to degrade features rather than spam errors. */
    private final AtomicBoolean available = new AtomicBoolean(false);

    /** Run once each time the API transitions from unreachable to reachable. */
    private volatile Runnable onReconnect;

    public ApiGateway(Plugin plugin, ApiClient client, RequestQueue queue) {
        this.plugin = plugin;
        this.scheduler = plugin.getServer().getScheduler();
        this.client = client;
        this.queue = queue;
        this.logger = plugin.getLogger();
    }

    public boolean isAvailable() {
        return available.get();
    }

    public ApiClient client() {
        return client;
    }

    public RequestQueue queue() {
        return queue;
    }

    /**
     * Records reachability and logs only the transitions.
     *
     * Logging every failed call during a ten-minute outage would bury the console; logging the
     * edges tells an operator exactly when it broke and when it came back.
     */
    public void markAvailable(boolean nowAvailable) {
        boolean previous = available.getAndSet(nowAvailable);
        if (previous == nowAvailable) {
            return;
        }

        if (!nowAvailable) {
            logger.warning("Robtic API is unreachable — queueing writes and serving cached data.");
            return;
        }

        logger.info("Robtic API is reachable again.");

        // The recovery edge. Everything earned or changed during the outage is reconciled here,
        // on a worker so the transition never runs on whichever thread happened to notice it.
        if (onReconnect != null) {
            scheduler.runTaskAsynchronously(plugin, onReconnect);
        }
    }

    /**
     * Registers the resync to run when the API comes back.
     *
     * Set after construction because the resync needs the economy and profile services, which in
     * turn need this gateway — the cycle is broken here rather than by making any of them lazy.
     */
    public void onReconnect(Runnable action) {
        this.onReconnect = action;
    }

    /**
     * A read. Runs off the main thread and delivers the result on it.
     *
     * Reads are never queued: an answer that arrives ten minutes late is worse than no answer, so
     * the failure handler is given the exception and decides what to show the player.
     */
    public <T> void read(Supplier<T> work, Consumer<T> onSuccess, Consumer<ApiException> onFailure) {
        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                T value = work.get();
                markAvailable(true);
                scheduler.runTask(plugin, () -> onSuccess.accept(value));
            } catch (ApiException error) {
                if (error.isRetryable()) {
                    markAvailable(false);
                }
                scheduler.runTask(plugin, () -> onFailure.accept(error));
            } catch (RuntimeException error) {
                logger.log(Level.WARNING, "Unexpected failure during an API read", error);
                ApiException wrapped = new ApiException("INTERNAL_ERROR", 0, error.getMessage(), error);
                scheduler.runTask(plugin, () -> onFailure.accept(wrapped));
            }
        });
    }

    /** A read whose failure the caller does not distinguish from an empty result. */
    public <T> void read(Supplier<T> work, Consumer<T> onSuccess) {
        read(work, onSuccess, error -> logger.fine("API read failed: " + error.getMessage()));
    }

    /**
     * A write that must not be lost.
     *
     * Delivered immediately when the API is up, queued for replay when it is not. The request id
     * is generated here and travels with the entry, so a replay carries the same key the first
     * attempt used and the API can recognise it.
     */
    public void submit(String path, JsonObject body, String requestId) {
        scheduler.runTaskAsynchronously(plugin, () -> deliver(path, body, requestId));
    }

    /** As {@link #submit} with a generated idempotency key. */
    public void submit(String path, JsonObject body) {
        submit(path, body, newRequestId());
    }

    /**
     * A write whose response the caller needs. Still queued on an outage, but the caller is told
     * the delivery was deferred so it can avoid promising the player a result it does not have.
     */
    public void submit(String path, JsonObject body, String requestId, Consumer<JsonObject> onSuccess, Consumer<ApiException> onFailure) {
        scheduler.runTaskAsynchronously(plugin, () -> {
            try {
                JsonObject response = client.post(path, body, requestId);
                markAvailable(true);
                scheduler.runTask(plugin, () -> onSuccess.accept(response));
            } catch (ApiException error) {
                if (error.isRetryable()) {
                    markAvailable(false);
                    queue.enqueue(path, body, requestId);
                }
                scheduler.runTask(plugin, () -> onFailure.accept(error));
            }
        });
    }

    /**
     * Delivers a write synchronously. Must run off the main thread.
     *
     * Used directly by shutdown, where the scheduler is already gone and there is no later chance
     * to try again.
     */
    public void deliver(String path, JsonObject body, String requestId) {
        try {
            client.post(path, body, requestId);
            markAvailable(true);
        } catch (ApiException error) {
            if (error.isRetryable()) {
                markAvailable(false);
                queue.enqueue(path, body, requestId);
            } else {
                logger.warning("The API rejected " + path + ": " + error.getMessage());
            }
        }
    }

    /** Replays the backlog. Scheduled periodically; a no-op when there is nothing queued. */
    public void flushQueue() {
        if (queue.size() == 0) {
            return;
        }

        scheduler.runTaskAsynchronously(plugin, () -> {
            int delivered = queue.flush(client);
            if (delivered > 0) {
                markAvailable(true);
                logger.info("Replayed " + delivered + " queued API request(s); " + queue.size() + " remaining.");
            }
        });
    }

    /** Convenience for a GET issued from inside a {@link #read} supplier. */
    public JsonObject get(String path, Map<String, String> query) {
        return client.get(path, query);
    }

    public static String newRequestId() {
        return "mc-" + UUID.randomUUID();
    }

    /** A key derived from the action, so a double-click deduplicates as well as a replay does. */
    public static String requestIdFor(String action, Object... parts) {
        StringBuilder builder = new StringBuilder("mc-").append(action);
        for (Object part : parts) {
            builder.append(':').append(part);
        }
        return builder.toString();
    }
}
