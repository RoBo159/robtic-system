package org.robtic.minecraft.progression.storage;

import org.robtic.minecraft.progression.workspace.Workspace;

import java.util.List;
import java.util.UUID;

/**
 * Where progression is persisted. Blocking; every method must be called off the main thread.
 *
 * <h2>An interface with two implementations, on purpose</h2>
 *
 * {@link ApiProgressionStorage} is the real one and matches the rest of this plugin: Robtic's API
 * owns player data, Mongo is behind it, and the game server is a client.
 * {@link FileProgressionStorage} writes flat JSON files in the plugin folder.
 *
 * The file one is not a toy. It is what lets this system be switched on before the corresponding API
 * endpoints are written and deployed, and what lets a second server run the whole feature without
 * touching the shared database. Without it, "jobs" and "the API is finished" become the same
 * milestone, which is a bad way to ship a system this size.
 *
 * <h2>Failure is an exception, not a null</h2>
 *
 * Every method throws on failure rather than returning empty. The distinction matters enormously:
 * "this player has no jobs" and "we could not find out whether this player has jobs" must not look
 * the same to the caller, because saving the first over the second destroys real data. See
 * {@link ProgressionRepository}, which is the only class that has to get this right.
 */
public interface ProgressionStorage {

    /**
     * Reads one player's progression.
     *
     * @return their stored data, or {@link PlayerProgression#EMPTY} for a player who genuinely has
     *         none. Never null
     * @throws StorageException when the answer could not be determined
     */
    PlayerProgression load(UUID playerId) throws StorageException;

    /**
     * Writes one player's progression, replacing whatever was there.
     *
     * Last-write-wins is correct here because a player is only ever on one server at a time and the
     * repository holds the authoritative copy in memory while they are online.
     */
    void save(UUID playerId, PlayerProgression progression) throws StorageException;

    /**
     * Every workspace on the server.
     *
     * Loaded once at boot and held in memory thereafter — workspaces are consulted on block-break
     * events, which is far too hot for anything else. There are hundreds of these at most, not
     * millions, so holding them all is a few hundred kilobytes.
     */
    List<Workspace> loadWorkspaces() throws StorageException;

    void saveWorkspace(Workspace workspace) throws StorageException;

    /**
     * Saves several workspaces.
     *
     * The default is a loop, which is right for a backend where each save is an independent request.
     * A backend that rewrites a shared index per save should override it — otherwise saving every
     * workspace at shutdown is quadratic in how many exist. See {@link FileProgressionStorage}.
     */
    default void saveWorkspaces(List<Workspace> workspaces) throws StorageException {
        for (Workspace workspace : workspaces) {
            saveWorkspace(workspace);
        }
    }

    void deleteWorkspace(String workspaceId) throws StorageException;

    /** A short name for log lines, so an operator can see which backend is actually in use. */
    String describe();

    /** Signals a failure to reach or parse storage. Deliberately checked — callers must decide. */
    class StorageException extends Exception {
        public StorageException(String message) {
            super(message);
        }

        public StorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
