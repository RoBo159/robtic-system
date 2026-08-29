package org.robtic.auth;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.robtic.core.geometry.WorldPoint;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Where each player was standing before authentication moved them, held across disconnects.
 *
 * <h2>Why this has to survive a restart, and an in-memory map does not</h2>
 *
 * The obvious implementation is a map keyed by player, filled on join and emptied on login. That
 * works right up until the case it exists for: a player is moved to the link world, does not log in,
 * and closes the game. The server saves them where they are standing — the link world — and the map
 * dies with the session. When they come back, the only location anyone can see is the link world
 * spawn, and their real position is gone.
 *
 * That failure was rare while only unlinked players were moved, because an unlinked player has no
 * position worth keeping. Now that every unauthenticated player is held in the link world it would
 * happen to established players, so the return location is written to disk the moment it is taken
 * and only cleared once they are actually back.
 *
 * <h2>Written rarely, read once</h2>
 *
 * One write when a player is moved and one delete when they return — so a busy server writes twice
 * per login, not per tick. The file is small (one entry per player currently mid-login) and is read
 * exactly once, at enable.
 *
 * <h2>A location is never overwritten with a link-world one</h2>
 *
 * {@link #remember} refuses to store a point inside the link world. Without that rule the second
 * join of a player who quit mid-login would overwrite their real position with the link spawn they
 * happened to load at, which is precisely the data this class exists to protect.
 */
public final class AuthReturnStore {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private final Path file;
    private final Logger logger;

    private final Map<UUID, WorldPoint> points = new ConcurrentHashMap<>();

    public AuthReturnStore(Path file, Logger logger) {
        this.file = file;
        this.logger = logger;
    }

    /**
     * Records where a player should be put back.
     *
     * @param insideLinkWorld whether the location is in the link world, which is never stored — see
     *                        the class note. Passed in rather than worked out here so this class
     *                        needs no opinion about what a link world is
     * @return whether anything was stored
     */
    public boolean remember(UUID uuid, Location location, boolean insideLinkWorld) {
        if (location == null || location.getWorld() == null || insideLinkWorld) {
            return false;
        }

        points.put(uuid, WorldPoint.of(location));
        save();

        return true;
    }

    /** Where this player was, if anywhere is recorded and the world is still loaded. */
    public Optional<Location> recall(UUID uuid) {
        WorldPoint point = points.get(uuid);

        return point == null ? Optional.empty() : point.toLocation();
    }

    public boolean has(UUID uuid) {
        return points.containsKey(uuid);
    }

    /**
     * Forgets a player, once they are actually back.
     *
     * Deliberately not called on quit. A player who disconnects before logging in still needs their
     * location on the next join, and that is the whole point of the file.
     */
    public void forget(UUID uuid) {
        if (points.remove(uuid) != null) {
            save();
        }
    }

    // ─── Persistence ──────────────────────────────────────────────────────────────────────────

    /** Reads the file. Called once, at enable. A missing or corrupt file starts empty. */
    public void load() {
        if (!Files.exists(file)) {
            return;
        }

        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonObject root = GSON.fromJson(reader, JsonObject.class);

            if (root == null) {
                return;
            }

            for (String key : root.keySet()) {
                if (!root.get(key).isJsonObject()) {
                    continue;
                }

                try {
                    UUID uuid = UUID.fromString(key);

                    // One unreadable entry is skipped rather than failing the load: the other
                    // players in the file are still owed their positions.
                    WorldPoint.fromJson(root.getAsJsonObject(key))
                            .ifPresent(point -> points.put(uuid, point));
                } catch (IllegalArgumentException notAUuid) {
                    // Same reasoning.
                }
            }

            logger.fine("Loaded " + points.size() + " pending auth return location(s).");
        } catch (IOException | RuntimeException failure) {
            logger.log(Level.WARNING, "Could not read " + file.getFileName()
                    + ". Players mid-login will return to spawn instead of where they were.", failure);
        }
    }

    /**
     * Writes the file.
     *
     * Synchronous, and that is a deliberate trade rather than an oversight. It runs twice per login
     * on a file holding one line per player currently authenticating — a handful of entries at most
     * — and doing it inline means the record is on disk before the teleport that makes it necessary.
     * An asynchronous write could lose the race against a player closing their client, which is the
     * exact scenario this file exists for.
     */
    private void save() {
        JsonObject root = new JsonObject();

        points.forEach((uuid, point) -> root.add(uuid.toString(), point.toJson()));

        try {
            Path parent = file.getParent();

            if (parent != null) {
                Files.createDirectories(parent);
            }

            try (Writer writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                GSON.toJson(root, writer);
            }
        } catch (IOException | RuntimeException failure) {
            logger.log(Level.WARNING, "Could not write " + file.getFileName()
                    + ". A player who disconnects mid-login may return to spawn.", failure);
        }
    }
}
