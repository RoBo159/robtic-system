package org.robtic.core.api;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Durable outbox for writes made while the API is unreachable.
 *
 * A coin credit, a jail, a staff log — none of these may be silently dropped because the network
 * blinked. Each is appended here and replayed when the API returns, and because every entry
 * carries the idempotency key the original request used, a replay the API already saw is
 * recognised and applied once.
 *
 * The queue is written to disk on shutdown and read back on start, so a restart during an outage
 * does not lose the backlog. Reads are never queued: a stale read is worse than a failed one.
 */
public final class RequestQueue {

    /** Mirrors API_QUEUE in libs/sdk. */
    private static final int MAX_ENTRIES = 5_000;
    private static final long MAX_AGE_MILLIS = 24 * 60 * 60 * 1000L;
    private static final int FLUSH_BATCH_SIZE = 50;

    /** One queued write. */
    public record Entry(String path, JsonObject body, String requestId, long queuedAt) {

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("path", path);
            json.add("body", body);
            json.addProperty("requestId", requestId);
            json.addProperty("queuedAt", queuedAt);
            return json;
        }

        static Entry fromJson(JsonObject json) {
            return new Entry(
                    json.get("path").getAsString(),
                    json.getAsJsonObject("body"),
                    json.get("requestId").getAsString(),
                    json.get("queuedAt").getAsLong()
            );
        }
    }

    private final Deque<Entry> entries = new ArrayDeque<>();
    private final Path storageFile;
    private final Logger logger;

    public RequestQueue(Path storageFile, Logger logger) {
        this.storageFile = storageFile;
        this.logger = logger;
    }

    /**
     * Appends a write. When the queue is full the **oldest** entry is dropped: during a long
     * outage the most recent actions are the ones still worth replaying, and an unbounded queue
     * would eventually exhaust the server's heap.
     */
    public synchronized void enqueue(String path, JsonObject body, String requestId) {
        if (entries.size() >= MAX_ENTRIES) {
            Entry dropped = entries.pollFirst();
            if (dropped != null) {
                logger.warning("Offline queue is full — dropped the oldest entry for " + dropped.path());
            }
        }

        entries.addLast(new Entry(path, body, requestId, System.currentTimeMillis()));
    }

    public synchronized int size() {
        return entries.size();
    }

    /**
     * Replays up to one batch. Entries are put back at the front on a retryable failure so the
     * original ordering survives, and discarded on anything else — a request the API rejected as
     * invalid will be rejected identically forever.
     *
     * Returns how many entries were successfully delivered.
     */
    public int flush(ApiClient client) {
        List<Entry> batch = take();
        if (batch.isEmpty()) {
            return 0;
        }

        int delivered = 0;

        for (int index = 0; index < batch.size(); index++) {
            Entry entry = batch.get(index);

            if (System.currentTimeMillis() - entry.queuedAt() > MAX_AGE_MILLIS) {
                logger.warning("Discarded a queued " + entry.path() + " older than 24 hours");
                continue;
            }

            try {
                client.post(entry.path(), entry.body(), entry.requestId());
                delivered++;
            } catch (ApiException error) {
                if (error.isRetryable()) {
                    // Still unreachable. Put this entry and everything after it back, in order.
                    requeueFront(batch.subList(index, batch.size()));
                    return delivered;
                }
                logger.warning("Dropped a queued " + entry.path() + ": " + error.getMessage());
            }
        }

        return delivered;
    }

    private synchronized List<Entry> take() {
        List<Entry> batch = new ArrayList<>(Math.min(FLUSH_BATCH_SIZE, entries.size()));
        for (int index = 0; index < FLUSH_BATCH_SIZE && !entries.isEmpty(); index++) {
            batch.add(entries.pollFirst());
        }
        return batch;
    }

    private synchronized void requeueFront(List<Entry> remaining) {
        for (int index = remaining.size() - 1; index >= 0; index--) {
            entries.addFirst(remaining.get(index));
        }
    }

    /** Persists the backlog so a restart during an outage does not lose it. */
    public synchronized void save() {
        if (entries.isEmpty()) {
            deleteQuietly();
            return;
        }

        StringBuilder builder = new StringBuilder();
        for (Entry entry : entries) {
            builder.append(entry.toJson()).append('\n');
        }

        try {
            Files.createDirectories(storageFile.getParent());
            Files.writeString(storageFile, builder.toString(), StandardCharsets.UTF_8);
            logger.info("Persisted " + entries.size() + " queued API request(s) for replay on next start.");
        } catch (IOException error) {
            logger.log(Level.WARNING, "Could not persist the offline request queue", error);
        }
    }

    /** Restores a backlog written by a previous run. */
    public synchronized void load() {
        if (!Files.exists(storageFile)) {
            return;
        }

        try {
            for (String line : Files.readAllLines(storageFile, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                entries.addLast(Entry.fromJson(JsonParser.parseString(line).getAsJsonObject()));
            }
            if (!entries.isEmpty()) {
                logger.info("Restored " + entries.size() + " queued API request(s) from the previous run.");
            }
        } catch (IOException | RuntimeException error) {
            logger.log(Level.WARNING, "Could not read the offline request queue — discarding it", error);
            entries.clear();
        }

        deleteQuietly();
    }

    private void deleteQuietly() {
        try {
            Files.deleteIfExists(storageFile);
        } catch (IOException error) {
            logger.log(Level.FINE, "Could not remove the offline queue file", error);
        }
    }
}
